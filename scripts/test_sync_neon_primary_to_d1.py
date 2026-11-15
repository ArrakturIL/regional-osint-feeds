"""Tests for Neon-primary D1 replication (no stale GitHub JSON inputs)."""
import contextlib
import io
import os
from pathlib import Path
import unittest
from unittest import mock
from types import SimpleNamespace

from scripts.sync_neon_primary_to_d1 import execute_replica_sync, main
from scripts.neon_mirror import SOURCE_FILES


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
            return SimpleNamespace(source_key=key)
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
                    mirror=mirror,client_factory=Client)

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


if __name__=='__main__':
    unittest.main()
