"""Site visitors for /ops (owner 20.11): Cloudflare Web Analytics -> D1.

Reads the RUM dataset of regional-watch.pages.dev (site tag in
config/web-analytics.json) for the last 24 h and the last 7 days and stores
it in private D1 regional-osint.usage_daily:
  - one row per UTC day: metric site_visits / site_pageviews (history);
  - one row day='latest', metric='site_visitors' with the JSON summary that
    /api/ops shows at the top of the owner panel.
Web Analytics counts no cookies; a "visit" is a page view that came from
another site or was typed in (Cloudflare's definition). Secrets are never printed.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scripts.neon_to_d1 import D1Client
from scripts.usage_report import GRAPHQL, TABLE_SQL, UPSERT_SQL, _post_json

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/web-analytics.json"
QUERY = """query($acc:String!,$tag:String!,$week:Time!,$day:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$acc}){
 days: rumPageloadEventsAdaptiveGroups(limit:10, filter:{siteTag:$tag, datetime_geq:$week, datetime_lt:$until}, orderBy:[date_ASC]){ count sum{visits} dimensions{date} }
 last24h: rumPageloadEventsAdaptiveGroups(limit:1, filter:{siteTag:$tag, datetime_geq:$day, datetime_lt:$until}){ count sum{visits} }
 week: rumPageloadEventsAdaptiveGroups(limit:1, filter:{siteTag:$tag, datetime_geq:$week, datetime_lt:$until}){ count sum{visits} }
 paths: rumPageloadEventsAdaptiveGroups(limit:6, filter:{siteTag:$tag, datetime_geq:$week, datetime_lt:$until}, orderBy:[count_DESC]){ count dimensions{requestPath} }
 countries: rumPageloadEventsAdaptiveGroups(limit:6, filter:{siteTag:$tag, datetime_geq:$week, datetime_lt:$until}, orderBy:[count_DESC]){ count dimensions{countryName} }
}}}"""


def _total(groups: list[dict]) -> tuple[int, int]:
    g = groups[0] if groups else {}
    return int((g.get("sum") or {}).get("visits") or 0), int(g.get("count") or 0)


def summarize(account: dict, now: datetime) -> dict:
    """Pure: GraphQL account node -> summary shown in /ops."""
    v24, p24 = _total(account.get("last24h") or [])
    v7, p7 = _total(account.get("week") or [])
    days = [{"date": g["dimensions"]["date"], "visits": int(g["sum"]["visits"] or 0), "pageviews": int(g["count"] or 0)}
            for g in account.get("days") or []]
    paths = [{"path": g["dimensions"]["requestPath"], "pageviews": int(g["count"] or 0)}
             for g in account.get("paths") or []]
    countries = [{"country": g["dimensions"]["countryName"], "pageviews": int(g["count"] or 0)}
                 for g in account.get("countries") or []]
    return {"visits_24h": v24, "pageviews_24h": p24, "visits_7d": v7, "pageviews_7d": p7,
            "days": days, "top_paths": paths, "top_countries": countries,
            "collected_ms": int(now.timestamp() * 1000)}


def rows_for(summary: dict) -> list[tuple]:
    """Pure: summary -> usage_daily rows (day, metric, value, detail)."""
    out = [("latest", "site_visitors", summary["visits_24h"], json.dumps(summary, ensure_ascii=False))]
    for d in summary["days"]:
        out.append((d["date"], "site_visits", d["visits"], ""))
        out.append((d["date"], "site_pageviews", d["pageviews"], ""))
    return out


def main(argv=None, now: datetime | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--no-store", action="store_true")
    a = p.parse_args(argv)
    now = now or datetime.now(timezone.utc)
    tag = json.loads(CONFIG.read_text(encoding="utf8"))["site_tag"]
    account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ.get("CLOUDFLARE_ANALYTICS_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN", "")
    iso = lambda t: t.strftime("%Y-%m-%dT%H:%M:%SZ")
    gql = _post_json(GRAPHQL, token, {"query": QUERY, "variables": {
        "acc": account_id, "tag": tag, "week": iso(now - timedelta(days=7)),
        "day": iso(now - timedelta(days=1)), "until": iso(now)}})
    if gql.get("errors"):
        print("::error::Cloudflare GraphQL: " + "; ".join(str(e.get("message"))[:120] for e in gql["errors"]))
        return 1
    summary = summarize(gql["data"]["viewer"]["accounts"][0], now)
    print(f"visits 24h={summary['visits_24h']} pageviews 24h={summary['pageviews_24h']} "
          f"visits 7d={summary['visits_7d']} pageviews 7d={summary['pageviews_7d']}")
    if not a.no_store:
        client = D1Client(account_id, "pending", os.environ["CLOUDFLARE_D1_API_TOKEN"])
        client.database_id = client.discover_database_id("regional-osint")
        client.query(TABLE_SQL)
        ms = str(summary["collected_ms"])
        for day, metric, value, detail in rows_for(summary):
            client.query(UPSERT_SQL, (day, metric, str(value), "", detail, ms))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
