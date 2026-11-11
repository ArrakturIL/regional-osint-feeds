#!/usr/bin/env python3
"""Offline regression checks for GDELT Events 2.0 public archives."""
import hashlib
import io
import zipfile
from collect_gdelt import parse_lastupdate, parse_export, MAX_SAMPLE


def row(event_id, country, root="18", url="https://example.org/news/1"):
    fields = [""] * 61
    fields[0] = str(event_id)
    fields[26] = "183"
    fields[28] = root
    fields[31] = "4"
    fields[32] = "2"
    fields[33] = "3"
    fields[52] = "Sample region"
    fields[53] = country
    fields[60] = url
    return "\t".join(fields)


def archive(*rows):
    data = ("\n".join(rows) + "\n").encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("20261111201500.export.CSV", data)
    return buf.getvalue()


a = archive(
    row(1, "IR"),
    row(2, "IS"),
    row(3, "US"),  # Not an action in one of the selected Middle Eastern countries.
    row(4, "IR", root="04"),  # Routine statement, not a coded conflict signal.
    row(5, "LE", url="javascript:alert(1)"),
)
count, samples = parse_export(a, "20261111201500")
assert count == 5 and len(samples) == 2
assert {x["action_country"] for x in samples} == {"IR", "IS"}
assert all(x["reported_sources"] == 2 for x in samples)
assert all(x["url"].startswith("https://") for x in samples)
assert MAX_SAMPLE <= 50, "limit per-run article-level outputs"

checksum = hashlib.md5(a).hexdigest()
latest = f"{len(a)} {checksum} http://data.gdeltproject.org/gdeltv2/20261111201500.export.CSV.zip"
date, stamp, md5, size = parse_lastupdate(latest)
assert stamp == "20261111201500" and size == len(a) and md5 == checksum
assert date.year == 2026 and date.minute == 15

try:
    parse_lastupdate("0" * 500)
    raise AssertionError("Malformed lastupdate should be rejected")
except ValueError:
    pass

print("PASS GDELT Events 2.0: 61 fields, geographic filtering, URLs, export metadata")
