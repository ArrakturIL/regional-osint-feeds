"""Offline Neon -> private Cloudflare D1 cache synchronization contract.

The D1 cache is a read replica. Neither this test nor its mocks access
production D1 or need any connection strings.
"""
import contextlib
from datetime import datetime,timezone,timedelta
import io
import json
import os
import unittest
from unittest.mock import patch

from scripts.neon_mirror import Snapshot,canonical_hash
from scripts.neon_to_d1 import D1Client,mirror_source,main,resolve_database_id

NOW=datetime(2026,11,15,12,0,tzinfo=timezone.utc)
DATA={"source":"gdelt_context","items":[{"id":"one"}],"bbox":[47.0,57.5]}
STATUS={"source":"gdelt_context","state":"ok","checked_at":NOW.isoformat().replace("+00:00","Z")}
SOURCE="gdelt"

def snap(data=DATA,status=STATUS,at=NOW):
    return Snapshot(SOURCE,data,status,at,canonical_hash(data),canonical_hash(status),
                    len(json.dumps(data)),len(json.dumps(status)))


class FakeNeon:
    def __init__(self,snapshot=None,damaged=False):
        self.snapshot=snapshot or snap()
        self.damaged=damaged
    def execute(self,sql,params):
        assert params==(SOURCE,)
        s=self.snapshot
        data={"altered":True} if self.damaged else s.data
        class Cursor:
            def fetchone(self):
                return (s.source_key,s.checked_at,s.data_sha256,s.status_sha256,
                        data,s.status)
        return Cursor()


class FakeD1:
    def __init__(self,existing=None):
        self.row=existing
        self.statements=[]
    def query(self,sql,params=()):
        self.statements.append((sql,params))
        if sql.lstrip().startswith("INSERT"):
            key,checked,body,state,data_sha,status_sha,synced=params
            checked=int(checked)
            if self.row is None or checked>self.row["checked_at_ms"]:
                self.row={"source_key":key,"checked_at_ms":checked,"data_json":body,
                          "status_json":state,"data_sha256":data_sha,
                          "status_sha256":status_sha}
                return [{"source_key":key}]
            return []
        if sql.lstrip().startswith("SELECT"):
            return [self.row] if self.row else []
        raise AssertionError("unexpected SQL")


class TestD1Mirror(unittest.TestCase):
    def test_verified_neon_row_upserts_atomically_and_reads_exact_json(self):
        d1=FakeD1()
        result=mirror_source(FakeNeon(),d1,SOURCE,now_ms=int(NOW.timestamp()*1000))
        self.assertEqual(result["result"],"written")
        self.assertEqual(result["source"],SOURCE)
        self.assertEqual(len(d1.statements),2)
        self.assertIn("ON CONFLICT",d1.statements[0][0])
        self.assertIn("excluded.checked_at_ms >",d1.statements[0][0])
        self.assertEqual(json.loads(d1.row["data_json"]),DATA)
        self.assertEqual(json.loads(d1.row["status_json"]),STATUS)

    def test_unchanged_mirror_is_idempotent(self):
        d1=FakeD1()
        mirror_source(FakeNeon(),d1,SOURCE)
        result=mirror_source(FakeNeon(),d1,SOURCE)
        self.assertEqual(result["result"],"unchanged")

    def test_older_neon_result_does_not_replace_newer_d1_data(self):
        d1=FakeD1()
        mirror_source(FakeNeon(),d1,SOURCE)
        original=d1.row.copy()
        later=NOW+timedelta(minutes=1)
        changed_status={**STATUS,"checked_at":later.isoformat().replace("+00:00","Z")}
        newer={**original,"checked_at_ms":int(later.timestamp()*1000),
               "status_json":json.dumps(changed_status),
               "status_sha256":canonical_hash(changed_status)}
        d1.row=newer
        result=mirror_source(FakeNeon(),d1,SOURCE)
        self.assertEqual(result["result"],"stale")
        self.assertEqual(d1.row,newer)

    def test_conflicting_equal_timestamp_is_not_a_success(self):
        d1=FakeD1()
        mirror_source(FakeNeon(),d1,SOURCE)
        other={**DATA,"items":[{"id":"other"}]}
        d1.row={**d1.row,"data_json":json.dumps(other),"data_sha256":canonical_hash(other)}
        with self.assertRaisesRegex(RuntimeError,"conflict"):
            mirror_source(FakeNeon(),d1,SOURCE)

    def test_tampered_neon_json_is_rejected_before_any_cache_write(self):
        d1=FakeD1()
        with self.assertRaisesRegex(ValueError,"digest"):
            mirror_source(FakeNeon(damaged=True),d1,SOURCE)
        self.assertEqual(d1.statements,[])

    def test_no_neon_row_must_not_be_published_as_empty_success(self):
        class NoRows:
            def execute(self,sql,params):
                class Cursor:
                    def fetchone(self):return None
                return Cursor()
        d1=FakeD1()
        with self.assertRaisesRegex(RuntimeError,"missing"):
            mirror_source(NoRows(),d1,SOURCE)
        self.assertEqual(d1.statements,[])

    def test_source_validation_precedes_query_and_rejects_path_traversal(self):
        d1=FakeD1()
        with self.assertRaisesRegex(ValueError,"unknown collector"):
            mirror_source(FakeNeon(),d1,"../secret")
        self.assertEqual(d1.statements,[])

    def test_corrupt_d1_readback_detected(self):
        d1=FakeD1()
        mirror_source(FakeNeon(),d1,SOURCE)
        d1.row["data_json"]='{"fabricated":true}'
        with self.assertRaisesRegex(RuntimeError,"D1 digest"):
            mirror_source(FakeNeon(),d1,SOURCE)

    def test_missing_cloudflare_token_or_neon_secret_fails_closed(self):
        with patch.dict(os.environ,{},clear=True),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(["--source","gdelt"]),2)

    def test_database_discovery_is_exact_and_rejects_multiple_names(self):
        self.assertEqual(resolve_database_id([{"name":"other","uuid":"b"},{"name":"regional-osint","uuid":"a"}],"regional-osint"),"a")
        with self.assertRaisesRegex(RuntimeError,"ambiguous"):
            resolve_database_id([{"name":"regional-osint","uuid":"a"},{"name":"regional-osint","uuid":"b"}],"regional-osint")
        with self.assertRaisesRegex(RuntimeError,"missing"):
            resolve_database_id([{"name":"other","uuid":"b"}],"regional-osint")

    def test_cloudflare_api_errors_do_not_expose_bearer_token(self):
        secret="DO_NOT_PRINT_ACCESS_TOKEN"
        class Denied:
            def __call__(self,request,timeout):
                from urllib.error import HTTPError
                raise HTTPError(request.full_url,403,"forbidden",None,None)
        client=D1Client("acct","db",secret,opener=Denied())
        with self.assertRaisesRegex(RuntimeError,"HTTP 403") as ctx:
            client.query("SELECT 1")
        self.assertNotIn(secret,str(ctx.exception))


if __name__=="__main__":
    unittest.main()
