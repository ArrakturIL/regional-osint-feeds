#!/usr/bin/env python3
"""Offline tests for the CEMS public metadata collector."""
from datetime import datetime,timezone
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location("collect_copernicus",Path(__file__).with_name("collect_copernicus.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW="2026-11-12T06:30:00Z"

class Tests(unittest.TestCase):
 def test_genuine_regional_product(self):
  row={"code":"EMSR945","name":"Flood assessment near Hormuz","countries":[{"short_name":"Oman"}],
       "activationTime":"2026-11-10T10:00:00Z","category":{"name":"Flood"},
       "n_products":4,"n_aois":2}
  x=m.as_product(row,"unified",NOW,datetime(2025,11,12,tzinfo=timezone.utc))
  self.assertEqual(x["code"],"EMSR945")
  self.assertEqual(x["product_count"],4)
  self.assertEqual(x["evidence_type"],"official_activation_metadata_not_damage_confirmation")
 def test_unrelated_and_old_rejected(self):
  cutoff=datetime(2025,11,12,tzinfo=timezone.utc)
  base={"code":"EMSN123","name":"Some damage","countries":["Iraq"],"activationTime":"2024-01-01T00:00:00Z"}
  self.assertIsNone(m.as_product(base,"unified",NOW,cutoff))
  base["activationTime"]="2026-11-10T00:00:00Z"
  base["countries"]=["France"]
  self.assertIsNone(m.as_product(base,"unified",NOW,cutoff))
 def test_malformed_and_duplicate(self):
  def fake(url):
   if "rapidmapping" in url:raise ValueError("Unavailable")
   return {"count":3,"results":[
     {"code":"EMSR945","name":"Flood map","countries":["Israel"],"activationTime":"2026-11-09T12:00:00Z","n_products":2},
     {"code":"EMSR945","name":"Flood map","countries":[{"short_name":"Israel"}],"activationTime":"2026-11-09T12:00:00Z","n_products":3},
     {"code":"NOT_A_CODE","name":"Invalid","countries":["Iran"],"activationTime":"2026-11-09T12:00:00Z"}
   ]}
  d,s=m.collect(now=NOW,getter=fake)
  self.assertEqual(len(d["products"]),1)
  self.assertEqual(d["products"][0]["product_count"],3)
  self.assertEqual(s["state"],"partial")
  self.assertEqual(d["quality"]["sources_failed"],1)
 def test_no_matching_does_not_mean_no_events(self):
  def fake(url):
   return {"count":0,"results":[]}
  d,s=m.collect(now=NOW,getter=fake)
  self.assertEqual(s["state"],"ok")
  self.assertEqual(d["products"],[])
  self.assertIn("first 100",d["quality"]["scope"])

if __name__=="__main__":
 unittest.main()
