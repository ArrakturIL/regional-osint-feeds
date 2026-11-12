#!/usr/bin/env python3
"""Offline validation of official UNOSAT catalogue handling."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location("unosat",Path(__file__).with_name("collect_unosat.py"))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Tests(unittest.TestCase):
 def test_region_folder_validation(self):
  self.assertTrue(m.is_recent_region("FL20260111PSE"))
  self.assertTrue(m.is_recent_region("FL20240421IRN"))
  self.assertFalse(m.is_recent_region("EQ20150425NPL"))
  self.assertFalse(m.is_recent_region("bad_folder"))
  self.assertFalse(m.is_recent_region("FL20260230PSE"))
  self.assertFalse(m.is_recent_region("FL20260431IRN"))
  self.assertFalse(m.is_recent_region("FL20261301PSE"))
 def test_analysis_services_only_and_attributed(self):
  def fetch(url):
   if url.endswith("services?f=pjson"):
    return {"folders":["FL20260111PSE","FL20240421IRN","EQ20260625VEN"],"services":[]}
   if "FL20260111PSE" in url:
    return {"services":[
     {"name":"FL20260111PSE/UNOSAT_Analysis","type":"MapServer"},
     {"name":"FL20260111PSE/Alert_Areas","type":"MapServer"},
     {"name":"other/UNOSAT_Analysis","type":"MapServer"}]}
   return {"services":[{"name":"FL20240421IRN/UNOSAT_Analysis","type":"MapServer"}]}
  s,h=m.collect(now="2026-11-12T07:00:00Z",getter=fetch)
  self.assertEqual(len(s["products"]),2)
  self.assertEqual(h["state"],"ok")
  self.assertEqual(s["products"][0]["region_code"],"PSE")
  self.assertIn("before using damage figures",s["products"][0]["verification"])
 def test_empty_does_not_mean_no_damage(self):
  def fetch(url):
   return {"folders":["FL20260111PSE"],"services":[]} if url.endswith("services?f=pjson") else {"services":[]}
  s,h=m.collect(now="2026-11-12T07:00:00Z",getter=fetch)
  self.assertEqual(s["products"],[])
  self.assertEqual(h["state"],"ok")
  self.assertIn("NOT",s["quality"]["meaning"])
 def test_partial_api(self):
  def fetch(url):
   if url.endswith("services?f=pjson"):return {"folders":["FL20260111PSE","FL20240421IRN"],"services":[]}
   if "IRN" in url:raise ValueError("temporarily unavailable")
   return {"services":[{"name":"FL20260111PSE/UNOSAT_Analysis","type":"MapServer"}]}
  s,h=m.collect(now="2026-11-12T07:00:00Z",getter=fetch)
  self.assertEqual(h["state"],"partial")
  self.assertEqual(len(s["products"]),1)
 def test_malformed_folder_is_isolated_from_healthy_data(self):
  def fetch(url):
   if url.endswith("services?f=pjson"):
    return {"folders":["FL20260111PSE","FL20240421IRN"],"services":[]}
   if "PSE" in url:
    return ["broken", "unexpected list"]
   return {"services":[{"name":"FL20240421IRN/UNOSAT_Analysis","type":"MapServer"}]}
  snapshot,health=m.collect(now="2026-11-12T07:00:00Z",getter=fetch)
  self.assertEqual(health["state"],"partial")
  self.assertEqual(len(snapshot["products"]),1)
  self.assertEqual(health["errors"][0]["folder"],"FL20260111PSE")

 def test_malformed_root_returns_validation_error(self):
  def fetch(url):
   return ["bad root"]
  with self.assertRaisesRegex(ValueError,"root catalogue"):
   m.collect(now="2026-11-12T07:00:00Z",getter=fetch)

 def test_all_twelve_relevant_folders_counted_as_complete(self):
  folders=[f"FL202601{day:02d}PSE" for day in range(1,13)]
  def fetch(url):
   return {"folders":folders,"services":[]} if url.endswith("services?f=pjson") else {"services":[]}
  snapshot,health=m.collect(now="2026-11-12T07:00:00Z",getter=fetch)
  self.assertEqual(health["state"],"ok")
  self.assertEqual(snapshot["quality"]["folder_total_region_candidates"],12)
  self.assertEqual(snapshot["quality"]["folders_scanned"],12)

 def test_no_region_folders_is_not_transport_error(self):
  def fetch(url):return {"folders":[],"services":[]}
  snapshot,health=m.collect(now="2026-11-12T07:00:00Z",getter=fetch)
  self.assertEqual(health["state"],"ok")
  self.assertEqual(snapshot["products"],[])

if __name__=="__main__":unittest.main()
