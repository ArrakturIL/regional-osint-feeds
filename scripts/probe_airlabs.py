"""One-off AirLabs probe (PR only, not merged): what the free plan returns."""
import json, os, urllib.request, urllib.error, collections

KEY = os.environ.get("AIRLABS_API_KEY", "").strip()
if not KEY:
    print("::error::AIRLABS_API_KEY not configured"); raise SystemExit(1)

def get(path, **q):
    q["api_key"] = KEY
    url = "https://airlabs.co/api/v9/" + path + "?" + "&".join(f"{k}={v}" for k, v in q.items())
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "RegionalWatch/1.0"}), timeout=40) as r:
            hdr = {k: v for k, v in r.headers.items() if "limit" in k.lower() or "remain" in k.lower()}
            return json.loads(r.read()), hdr
    except urllib.error.HTTPError as e:
        return {"http_error": e.code, "body": e.read()[:300].decode("utf-8", "replace")}, {}

for path, q in [("schedules", {"dep_iata": "TLV"}), ("schedules", {"dep_iata": "IKA"}), ("flights", {"bbox": "29,34,33.5,36"})]:
    body, hdr = get(path, **q)
    if "response" not in body:
        print(f"::notice::{path} {q}: no response {json.dumps(body)[:300]}"); continue
    resp = body["response"]
    req = body.get("request", {})
    lim = {k: req.get(k) for k in ("client", "key", "limits", "version") if k in req}
    if isinstance(lim.get("key"), dict):
        lim["key"] = {k: v for k, v in lim["key"].items() if k not in ("api_key", "id")}
    if isinstance(lim.get("client"), dict):
        lim["client"] = {k: v for k, v in lim["client"].items() if k in ("country_code", "connection_type")}
    rows = resp if isinstance(resp, list) else []
    st = collections.Counter(str(r.get("status")) for r in rows)
    delayed = sum(1 for r in rows if (r.get("dep_delayed") or r.get("delayed") or 0))
    fields = sorted(rows[0]) if rows else []
    print(f"::notice::{path} {q}: rows={len(rows)} status={dict(st)} delayed={delayed} hdr={hdr}")
    print(f"::notice::{path} fields={fields}")
    print(f"::notice::{path} request_meta={json.dumps(lim)[:600]}")
