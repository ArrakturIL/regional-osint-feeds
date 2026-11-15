"""Offline acceptance for the integrated Neon/D1 SHADOW pipeline.
No real Neon, Cloudflare, API token or shared D1 is touched here.
"""
from __future__ import annotations

import contextlib
import io
import os
from pathlib import Path
from unittest import TestCase, mock

from scripts.sync_collector_shadows import execute_shadow_sync, main
from scripts.neon_mirror import SOURCE_FILES

class DummyConn:
    def __init__(self):
        self.entered=0
        self.exited=0
        self.operations=[]
    def __enter__(self):
        self.entered+=1
        return self
    def __exit__(self,typ,ex,tb):
        self.exited+=1
        return False

class TestIntegratedShadowSync(TestCase):
    def setUp(self):
        self.sources=list(SOURCE_FILES)
        self.writers=[]
        self.d1_clients=[]
        self.neon_connections=[]
        self.snapshots={}
        from types import SimpleNamespace
        for key in self.sources:
            self.snapshots[key]=SimpleNamespace(source_key=key,checked_at=None,data_sha256='a'*64)

    def hooks(self):
        def loader(source,root):
            return self.snapshots[source]
        def connect(url):
            self.neon_connections.append(url)
            return DummyConn()
        def publish(connection,snapshot):
            self.writers.append(('neon',snapshot.source_key))
            return 'written'
        def verify(connection,snapshot):
            self.writers.append(('neon_readback',snapshot.source_key))
            return {'match':True}
        def mirror(connection,d1,source):
            self.writers.append(('d1_readback',source))
            return {'source':source,'result':'written','sha_prefix':'a'*12}
        class Client:
            def __init__(_,account,db,token):
                self.d1_clients.append((account,db,token))
            def discover_database_id(_,name):
                self.assertEqual(name,'regional-osint')
                return 'verified-id'
        return dict(loader=loader,connector=connect,publisher=publish,verifier=verify,
                    mirror=mirror,client_factory=Client)

    def test_eight_sources_prevalidated_before_a_single_neon_write_batch(self):
        out=execute_shadow_sync(Path('/unused'),'postgresql://secret','acct','token',**self.hooks())
        self.assertEqual(out['sources'],self.sources)
        self.assertEqual(out['neon_written'],8)
        self.assertEqual(out['d1_verified'],8)
        self.assertEqual(len(self.neon_connections),2)
        self.assertEqual(len(self.d1_clients),1)
        self.assertEqual([x[1] for x in self.writers if x[0]=='neon'],self.sources)
        self.assertEqual([x[1] for x in self.writers if x[0]=='d1_readback'],self.sources)

    def test_missing_input_aborts_without_connecting_or_mutating_anything(self):
        hooks=self.hooks()
        def invalid(source,root):
            if source=='gdelt': raise ValueError('invalid source snapshot')
            return self.snapshots[source]
        hooks['loader']=invalid
        with self.assertRaisesRegex(ValueError,'invalid source'):
            execute_shadow_sync(Path('/unused'),'postgresql://secret','acct','token',**hooks)
        self.assertEqual(self.writers,[])
        self.assertEqual(self.d1_clients,[])
        self.assertEqual(self.neon_connections,[])

    def test_neon_readback_failure_prevents_any_d1_write(self):
        hooks=self.hooks()
        def mismatch(conn,snapshot):
            return {'match':snapshot.source_key!='marad'}
        hooks['verifier']=mismatch
        with self.assertRaisesRegex(RuntimeError,'Neon.*readback'):
            execute_shadow_sync(Path('/unused'),'postgresql://secret','acct','token',**hooks)
        self.assertEqual(self.d1_clients,[])
        self.assertEqual([x for x in self.writers if x[0]=='d1_readback'],[])

    def test_d1_partial_failure_exits_nonzero_without_fabricating_parity(self):
        hooks=self.hooks()
        def failing_mirror(conn,d1,source):
            if source=='copernicus': raise RuntimeError('D1 unavailable')
            return {'source':source,'result':'unchanged','sha_prefix':'a'*12}
        hooks['mirror']=failing_mirror
        with self.assertRaisesRegex(RuntimeError,'D1 unavailable'):
            execute_shadow_sync(Path('/unused'),'postgresql://secret','acct','token',**hooks)
        self.assertEqual(len(self.d1_clients),1)

    def test_same_or_newer_neon_snapshot_does_not_regress_source(self):
        hooks=self.hooks()
        def publish(conn,snap):
            return 'stale' if snap.source_key=='analysts' else 'unchanged'
        hooks['publisher']=publish
        hooks['stored_reader']=lambda conn,source: self.snapshots[source]
        hooks['verifier']=lambda conn,snap:{'match':True}
        # Stale is accepted only when stored is proven newer.
        from datetime import datetime,timezone,timedelta
        now=datetime(2026,11,15,12,tzinfo=timezone.utc)
        self.snapshots['analysts'].checked_at=now
        hooks['stored_reader']=lambda conn,source: type('Stored',(),{'checked_at':now+timedelta(minutes=1)})()
        out=execute_shadow_sync(Path('/unused'),'postgresql://secret','acct','token',**hooks)
        self.assertEqual(out['neon_stale'],1)

    def test_no_secrets_refuses_to_run_or_log_credentials(self):
        stdout,stderr=io.StringIO(),io.StringIO()
        with mock.patch.dict(os.environ,{},clear=True),contextlib.redirect_stdout(stdout),contextlib.redirect_stderr(stderr):
            status=main(['--root','/unused'])
        self.assertEqual(status,2)
        self.assertNotIn('postgresql://',stdout.getvalue()+stderr.getvalue())

    def test_scheduled_workflow_is_main_only_repair_from_neon_primary(self):
        workflow=(Path(__file__).resolve().parents[1]/'.github/workflows/collector-shadow-sync.yml').read_text('utf8')
        self.assertIn("23 */2 * * *",workflow)
        self.assertIn("refs/heads/main",workflow)
        self.assertIn("contents: read",workflow)
        self.assertIn("cancel-in-progress: false",workflow)
        self.assertIn("python -m scripts.sync_neon_primary_to_d1",workflow)
        self.assertNotIn("python -m scripts.sync_collector_shadows --root",workflow)
        self.assertNotIn("git push",workflow)
        self.assertNotIn("pages deploy",workflow)

    def test_legacy_json_importer_is_retained_for_manual_recovery_only(self):
        legacy=(Path(__file__).resolve().parents[1]/'scripts/sync_collector_shadows.py').read_text('utf8')
        self.assertIn("execute_shadow_sync",legacy)
        self.assertIn("load_snapshot",legacy)
        workflow=(Path(__file__).resolve().parents[1]/'.github/workflows/collector-shadow-sync.yml').read_text('utf8')
        self.assertNotIn("sync_collector_shadows --root",workflow)
