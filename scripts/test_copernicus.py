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
 def test_exact_country_filter_prevents_oman_romanian_false_positive(self):
  self.assertTrue(m.relevant(["Oman"]))
  self.assertTrue(m.relevant(["occupied palestinian territory"]))
  self.assertTrue(m.relevant(["Iran (Islamic Republic of)"]))
  self.assertFalse(m.relevant(["Romania"]))
  self.assertFalse(m.relevant(["Germany, near Oman"]))
  self.assertFalse(m.relevant(["Sudanese expatriates in France"]))
 def test_regional_activation_on_second_page(self):
  seen=[]
  def fake(url):
   seen.append(url)
   if "offset=0" in url:
    # A real 100-item page must account for a count of 101.
    return {"count":101,"next":"https://example.invalid/page2","results":[
     {"code":"EMSR990","name":"Flood in Germany","countries":["Germany"],"activationTime":"2026-11-01T00:00:00Z"} for _ in range(100)]}
   return {"count":101,"next":None,"results":[
     {"code":"EMSR988","name":"Flash floods in southern Iran","countries":[{"short_name":"Iran"}],
      "activationTime":"2026-10-21T00:00:00Z","n_products":2}]}
  d,h=m.collect(now=NOW,getter=fake)
  self.assertEqual(len(d["products"]),1)
  self.assertEqual(d["products"][0]["code"],"EMSR988")
  self.assertTrue(any("offset=100" in x for x in seen))
  self.assertEqual(h["state"],"ok")
 def test_provider_claims_nonzero_count_with_empty_page(self):
  def bad(url):
   return {"count":25,"results":[],"next":None}
  d,h=m.collect(now=NOW,getter=bad)
  self.assertNotEqual(h["state"],"ok")
  self.assertEqual(h["state"],"error")
  self.assertEqual(len(h["error_types"]),3)

 def test_partial_provider_preserves_healthy_catalogue(self):
  def mixed(url):
   if "rapidmapping.emergency" in url:
    return {"count":25,"results":[],"next":None}
   return {"count":0,"results":[],"next":None}
  d,h=m.collect(now=NOW,getter=mixed)
  self.assertEqual(h["state"],"partial")
  self.assertEqual(d["quality"]["sources_successful"],2)
  self.assertEqual(h["error_types"][0]["provider"],"rapid")

 def test_timeout_on_page_two_marks_partial_without_keyerror(self):
  def intermittent(url):
   if "mapping.emergency.copernicus.eu/activations/" in url:
    if "offset=0" in url:
     return {"count":101,"next":"https://example.invalid/2",
             "results":[{"code":"EMSR911","countries":["Germany"],"name":"Flood",
                         "activationTime":"2026-10-01T00:00:00Z"} for _ in range(100)]}
    raise TimeoutError("page 2 timed out")
   return {"count":0,"results":[],"next":None}
  d,h=m.collect(now=NOW,getter=intermittent)
  self.assertEqual(h["state"],"partial")
  self.assertTrue(d["pages"]["unified"]["truncated"])
  self.assertEqual(d["quality"]["sources_successful"],2)

 def test_no_matching_does_not_mean_no_events(self):
  def fake(url):
   return {"count":0,"results":[]}
  d,s=m.collect(now=NOW,getter=fake)
  self.assertEqual(s["state"],"ok")
  self.assertEqual(d["products"],[])
  self.assertIn("Bounded",d["quality"]["scope"])

if __name__=="__main__":
 unittest.main()
