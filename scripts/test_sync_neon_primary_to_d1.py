"""Tests for Neon-primary D1 replication (no stale GitHub JSON inputs)."""
from datetime import datetime, timezone, timedelta
import contextlib
import io
import json
import tempfile
import os
from pathlib import Path
import unittest
from unittest import mock
from types import SimpleNamespace

from scripts.sync_neon_primary_to_d1 import execute_replica_sync, main, assess_snapshot_health, summarize_health, verify_d1_last_good, emit_health_report
from scripts.neon_mirror import SOURCE_FILES, canonical_hash


class DummyConnection:
    def __init__(self, trace):
        self.trace=trace
    def __enter__(self):
        self.trace.append('neon_enter')
        return self
    def __exit__(self, *_):
        self.trace.append('neon_exit')
        return False


class TestNeonPrimaryReplication(unittest.TestCase):
    def setUp(self):
        self.trace=[]
        self.sources=list(SOURCE_FILES)

    def hooks(self):
        trace=self.trace
        sources=self.sources
        def connector(url):
            trace.append('neon_connect')
            return DummyConnection(trace)
        def stored_reader(conn, key):
            trace.append(('verified_neon',key))
            return SimpleNamespace(source_key=key, checked_at=datetime.now(timezone.utc), status={'state':'ok'})
        def mirror(conn, client, key):
            trace.append(('d1_verified',key))
            return {'source':key, 'result':'written'}
        class Client:
            def __init__(self, account,db,token):
                trace.append('d1_construct')
            def discover_database_id(self, name):
                trace.append('d1_discover')
                if name!='regional-osint':
                    raise AssertionError('wrong D1 database name')
                return 'verified-db'
        return dict(connector=connector,stored_reader=stored_reader,
                    mirror=mirror,client_factory=Client, last_good_checker=lambda *_: True)

    def test_neon_is_authoritative_and_all_eight_are_verified_before_first_d1_write(self):
        out=execute_replica_sync('neon-secret','account','d1-secret',**self.hooks())
        self.assertEqual(out['sources'],self.sources)
        self.assertEqual(out['d1_verified'],8)
        self.assertEqual(out['mode'],'neon_primary')
        self.assertEqual(self.trace.count('neon_connect'),1)
        self.assertEqual([p[1] for p in self.trace if isinstance(p,tuple) and p[0]=='verified_neon'],self.sources)
        self.assertEqual([p[1] for p in self.trace if isinstance(p,tuple) and p[0]=='d1_verified'],self.sources)
        self.assertLess(self.trace.index(('verified_neon',self.sources[-1])),self.trace.index('d1_construct'))
        self.assertNotIn('load_snapshot',str(self.trace))

    def test_missing_or_mismatched_neon_row_fails_before_d1(self):
        for broken in ('missing','wrong_source'):
            with self.subTest(broken=broken):
                self.trace.clear()
                hooks=self.hooks()
                original=hooks['stored_reader']
                def reader(conn,key):
                    if key=='gdelt':
                        return None if broken=='missing' else SimpleNamespace(source_key='other')
                    return original(conn,key)
                hooks['stored_reader']=reader
                with self.assertRaises(RuntimeError):
                    execute_replica_sync('neon-secret','account','d1-secret',**hooks)
                self.assertNotIn('d1_construct',self.trace)
                self.assertFalse(any(isinstance(p,tuple) and p[0]=='d1_verified' for p in self.trace))

    def test_d1_replication_failure_is_visible(self):
        hooks=self.hooks()
        def mirror(conn,client,key):
            if key=='copernicus':
                raise RuntimeError('source-specific D1 issue')
            return {'source':key,'result':'unchanged'}
        hooks['mirror']=mirror
        with self.assertRaises(RuntimeError):
            execute_replica_sync('neon-secret','account','d1-secret',**hooks)
        self.assertIn('d1_discover',self.trace)

    def test_error_snapshot_holds_last_valid_d1_instead_of_replacing_it(self):
        hooks=self.hooks()
        seen=[]
        def reader(conn,key):
            return SimpleNamespace(source_key=key, checked_at=datetime.now(timezone.utc),
                 status={'state':'error' if key=='gdelt' else 'ok'})
        def mirror(conn,client,key):
            seen.append(key)
            return {'source':key,'result':'unchanged'}
        hooks['stored_reader']=reader
        hooks['mirror']=mirror
        out=execute_replica_sync('neon-secret','account','d1-secret',**hooks)
        self.assertNotIn('gdelt',seen,'invalid source state must not overwrite D1 last valid pair')
        self.assertEqual(out['d1_verified'],7)
        health={row['source']:row['health'] for row in out['health']}
        self.assertEqual(health['gdelt'],'source_unavailable')
        self.assertEqual(health['analysts'],'data_fresh')

    def test_error_source_requires_verified_existing_d1_last_good_not_just_a_skip(self):
        hooks=self.hooks()
        observed=[]
        def reader(conn,key):
            return SimpleNamespace(source_key=key,checked_at=datetime.now(timezone.utc),
                                   status={"state":"error" if key=="gdelt" else "ok"})
        def check(client,key):
            observed.append(key)
            return True
        hooks["stored_reader"]=reader
        hooks["last_good_checker"]=check
        out=execute_replica_sync("neon","account","token",**hooks)
        self.assertIn("gdelt",observed)
        self.assertEqual(out["d1_verified"],7)
        self.assertEqual(next(x for x in out["health"] if x["source"]=="gdelt")["replica_state"],"held_last_valid")
        hooks["last_good_checker"]=lambda *_: False
        with self.assertRaisesRegex(RuntimeError,"last|cache|fallback|source"):
            execute_replica_sync("neon","account","token",**hooks)

    def test_missing_credentials_never_contact_neon_or_cloudflare(self):
        with self.assertRaises(ValueError):
            execute_replica_sync('','account','token',**self.hooks())
        self.assertEqual(self.trace,[])
        with mock.patch.dict(os.environ,{},clear=True),contextlib.redirect_stderr(io.StringIO()) as stderr:
            self.assertEqual(main([]),2)
        self.assertNotIn('neon-secret',stderr.getvalue())

    def test_workflow_uses_neon_primary_and_never_checkout_legacy_json(self):
        workflow=(Path(__file__).resolve().parents[1]/'.github/workflows/collector-shadow-sync.yml').read_text(encoding='utf8')
        self.assertIn('python -m scripts.sync_neon_primary_to_d1',workflow)
        self.assertNotIn('python -m scripts.sync_collector_shadows --root',workflow)
        self.assertIn('contents: read',workflow)
        self.assertIn('23 */2 * * *',workflow)
        self.assertNotIn('git push',workflow)


class TestStorageHealthClassification(unittest.TestCase):
    """Health is based on source cadence and verified replication, not on a green sync job."""

    NOW = datetime(2026, 11, 15, 22, 0, tzinfo=timezone.utc)

    def snapshot(self, source="gdelt", *, hours_old=1, state="ok"):
        return SimpleNamespace(source_key=source,
                               checked_at=self.NOW - timedelta(hours=hours_old),
                               status={"state": state})

    def assess(self, snapshot, result="unchanged"):
        return assess_snapshot_health(snapshot, {"source":snapshot.source_key,"result":result}, now=self.NOW)

    def test_fresh_is_only_verified_ok_within_source_cadence(self):
        healthy=self.assess(self.snapshot("gdelt",hours_old=1))
        self.assertEqual(healthy["health"],"data_fresh")
        self.assertEqual(healthy["collector_state"],"ok")
        self.assertEqual(healthy["replica_state"],"unchanged")

    def test_partial_source_is_not_reported_as_healthy_after_successful_d1_readback(self):
        partial=self.assess(self.snapshot("copernicus",hours_old=1,state="partial"))
        self.assertEqual(partial["health"],"collector_partial")
        self.assertEqual(partial["collector_state"],"partial")

    def test_stale_ok_snapshot_is_not_misrepresented_as_fresh(self):
        stale=self.assess(self.snapshot("marad",hours_old=15))
        self.assertEqual(stale["health"],"data_stale")
        self.assertEqual(stale["collector_state"],"ok")
        self.assertGreater(stale["age_minutes"],700)

    def test_worker_cadence_allows_daily_satellite_and_12h_unosat(self):
        self.assertEqual(self.assess(self.snapshot("satellite",hours_old=24))["health"],"data_fresh")
        self.assertEqual(self.assess(self.snapshot("unosat",hours_old=12))["health"],"data_fresh")

    def test_real_last_good_verifier_rejects_missing_corrupt_or_unhealthy_rows(self):
        stamp=self.NOW.isoformat()
        data={"items":[{"id":"one"}]}
        status={"state":"ok","checked_at":stamp}
        def row(dat=data,state=status):
            return {"source_key":"gdelt","checked_at_ms":int(self.NOW.timestamp()*1000),
                    "data_json":json.dumps(dat),"status_json":json.dumps(state),
                    "data_sha256":canonical_hash(data),
                    "status_sha256":canonical_hash(status)}
        class Client:
            def __init__(self,rows): self.rows=rows
            def query(self,sql,params):
                self.seen=(sql,params)
                return self.rows
        c=Client([row()])
        self.assertTrue(verify_d1_last_good(c,"gdelt"))
        self.assertIn("SELECT",c.seen[0])
        self.assertEqual(c.seen[1],("gdelt",))
        self.assertFalse(verify_d1_last_good(Client([]),"gdelt"))
        self.assertFalse(verify_d1_last_good(Client([row(dat={"items":["tampered"]})]),"gdelt"))
        invalid={"state":"error","checked_at":stamp}
        self.assertFalse(verify_d1_last_good(Client([row(state=invalid)]),"gdelt"))
        with self.assertRaisesRegex(ValueError,"unknown"):
            verify_d1_last_good(Client([]),"../secret")

    def test_health_step_summary_uses_real_newlines_and_no_payload_values(self):
        observation=self.assess(self.snapshot("gdelt",hours_old=8))
        summary=summarize_health([observation])
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/"health.md"
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                emit_health_report([observation],summary,summary_path=str(dest))
            text=dest.read_text(encoding="utf8")
            self.assertIn("\\n| Source | Health |",text)
            self.assertIn("| gdelt | data_stale |",text)
            self.assertNotIn("NEON_DATABASE_URL",text)
            self.assertIn("::warning",stdout.getvalue())

    def test_source_error_or_invalid_future_timestamp_is_unavailable(self):
        self.assertEqual(self.assess(self.snapshot("gdelt",hours_old=1,state="error"))["health"],"source_unavailable")
        self.assertEqual(self.assess(self.snapshot("gdelt",hours_old=-2))["health"],"source_unavailable")

    def test_d1_ahead_is_visible_not_mistaken_for_d1_current(self):
        row=self.assess(self.snapshot("gdelt",hours_old=1),result="stale")
        self.assertEqual(row["health"],"replica_ahead")
        self.assertEqual(row["replica_state"],"stale")

    def test_status_report_preserves_partial_and_stale_not_blanketed_as_8_8_ok(self):
        reports=[self.assess(self.snapshot("gdelt",hours_old=1)),
                 self.assess(self.snapshot("copernicus",hours_old=1,state="partial")),
                 self.assess(self.snapshot("marad",hours_old=15))]
        summary=summarize_health(reports)
        self.assertEqual(summary["counts"],{"data_fresh":1,"collector_partial":1,"data_stale":1})
        self.assertEqual(summary["overall"],"degraded")
        self.assertEqual(summary["source_count"],3)
        self.assertFalse(any("password" in str(v).lower() for v in summary.values()))

if __name__=='__main__':
    unittest.main()
