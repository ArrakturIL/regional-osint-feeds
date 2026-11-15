"""P1 translation rollback snapshot contract, offline SQLite regression.
The fixture never accesses real D1, does not read secrets, and only checks
reversible backup storage before any editable translation is published.
"""
import json
from pathlib import Path
import sqlite3
import unittest

ROOT=Path(__file__).resolve().parents[1]
SCHEMA=ROOT/"storage/cloudflare/002_p1_translation_repair_backups.sql"

class TestP1Backup(unittest.TestCase):
    def create_db(self):
        db=sqlite3.connect(":memory:")
        db.execute("""CREATE TABLE news_items (
            id TEXT PRIMARY KEY,source TEXT,headline TEXT,headline_ru TEXT,
            summary TEXT,summary_ru TEXT,url TEXT,published_ms INTEGER,
            discovered_ms INTEGER,priority INTEGER,comment TEXT,
            comment_model TEXT,comment_at_ms INTEGER)""")
        db.execute("""CREATE TABLE regional_i18n (
            kind TEXT,item_id TEXT,language TEXT,source_hash TEXT,title TEXT,
            body TEXT,commentary TEXT,quality_score INTEGER,model TEXT,
            created_at_ms INTEGER,PRIMARY KEY(kind,item_id,language))""")
        db.execute("INSERT INTO news_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",(
            'sample','source','Original title','corrupt RU','Original summary',
            'corrupt summary','https://example.org/source',1794700000000,
            1794700000100,8,None,'EDITORIAL_SKIP',1794700000200))
        db.execute("INSERT INTO regional_i18n VALUES(?,?,?,?,?,?,?,?,?,?)",(
            'news','sample','he','a'*64,'שגוי','שגוי','',85,'model',1794700000300))
        db.executescript(SCHEMA.read_text(encoding="utf8"))
        return db

    def test_backup_captures_all_original_fields_before_changes(self):
        db=self.create_db()
        sql=(ROOT/"storage/cloudflare/003_p1_translation_backup_capture.sql").read_text("utf8")
        db.execute(sql,('batch_test',1794700000400,'sample'))
        row=db.execute("SELECT news_json,hebrew_json FROM regional_translation_repair_backups").fetchone()
        old_news=json.loads(row[0]);old_he=json.loads(row[1])
        self.assertEqual(old_news['headline_ru'],'corrupt RU')
        self.assertEqual(old_news['summary_ru'],'corrupt summary')
        self.assertEqual(old_news['comment_model'],'EDITORIAL_SKIP')
        self.assertEqual(old_he['title'],'שגוי')
        self.assertEqual(old_he['source_hash'],'a'*64)
        self.assertEqual(old_he['model'],'model')
        db.execute("UPDATE news_items SET headline_ru='corrected' WHERE id='sample'")
        self.assertEqual(json.loads(db.execute("SELECT news_json FROM regional_translation_repair_backups").fetchone()[0])['headline_ru'],'corrupt RU')
        db.close()

    def test_backup_is_immutable_and_repeated_capture_does_not_replace(self):
        db=self.create_db()
        sql=(ROOT/"storage/cloudflare/003_p1_translation_backup_capture.sql").read_text("utf8")
        db.execute(sql,('batch_test',1794700000400,'sample'))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE regional_translation_repair_backups SET news_json='{}'")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM regional_translation_repair_backups")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute(sql,('batch_test',1794700000401,'sample'))
        count=db.execute("SELECT COUNT(*) FROM regional_translation_repair_backups").fetchone()[0]
        self.assertEqual(count,1)
        db.close()

    def test_missing_hebrew_original_fails_without_writing_backup(self):
        db=self.create_db()
        db.execute("DELETE FROM regional_i18n")
        sql=(ROOT/"storage/cloudflare/003_p1_translation_backup_capture.sql").read_text("utf8")
        db.execute(sql,('batch_test',1794700000400,'sample'))
        self.assertEqual(db.execute("SELECT COUNT(*) FROM regional_translation_repair_backups").fetchone()[0],0)
        db.close()

if __name__=='__main__':
    unittest.main()
