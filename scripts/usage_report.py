"""H-01: measured daily usage of Workers, D1, Workers AI and GitHub Actions.

Reads Cloudflare GraphQL analytics (not app counters) for one UTC day, compares
with config/usage-budgets.json, stores one row per metric in private D1
(regional-osint.usage_daily) and prints a Markdown summary. Exit code 2 means a
budget reached warn_ratio; exit 0 otherwise. Secrets are never printed.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib import request as urllib_request, error as urllib_error, parse as urllib_parse

from scripts.neon_to_d1 import D1Client

ROOT = Path(__file__).resolve().parents[1]
BUDGETS = ROOT / "config/usage-budgets.json"
GRAPHQL = "https://api.cloudflare.com/client/v4/graphql"
QUERY = """query($acc:String!,$d:Date!){viewer{accounts(filter:{accountTag:$acc}){
 workers: workersInvocationsAdaptive(limit:50, filter:{date:$d}){ sum{requests errors cpuTimeUs} quantiles{cpuTimeP99} dimensions{scriptName} }
 d1: d1AnalyticsAdaptiveGroups(limit:50, filter:{date:$d}){ sum{rowsRead rowsWritten} dimensions{databaseId} }
 ai: aiInferenceAdaptiveGroups(limit:50, filter:{date:$d}){ sum{totalNeurons} count dimensions{modelId} }
}}}"""
TABLE_SQL = (
    "CREATE TABLE IF NOT EXISTS usage_daily (day TEXT NOT NULL, metric TEXT NOT NULL, "
    "value REAL NOT NULL, budget REAL, detail TEXT, collected_ms INTEGER NOT NULL, PRIMARY KEY(day,metric))"
)
UPSERT_SQL = (
    "INSERT INTO usage_daily(day,metric,value,budget,detail,collected_ms) "
    "VALUES(?,?,CAST(? AS REAL),CAST(NULLIF(?,'') AS REAL),?,CAST(? AS INTEGER)) "
    "ON CONFLICT(day,metric) DO UPDATE SET value=excluded.value,budget=excluded.budget,"
    "detail=excluded.detail,collected_ms=excluded.collected_ms"
)


def _post_json(url: str, token: str, payload: dict, opener=urllib_request.urlopen) -> dict:
    req = urllib_request.Request(url, data=json.dumps(payload).encode(), method="POST", headers={
        "Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with opener(req, timeout=30) as r:
            return json.loads(r.read(4_000_000))
    except urllib_error.HTTPError as exc:
        raise RuntimeError(f"Cloudflare GraphQL HTTP {exc.code}") from None


def _get_json(url: str, token: str, opener=urllib_request.urlopen) -> dict:
    req = urllib_request.Request(url, headers={"Authorization": "Bearer " + token,
                                               "Accept": "application/vnd.github+json"})
    try:
        with opener(req, timeout=30) as r:
            return json.loads(r.read(8_000_000))
    except urllib_error.HTTPError as exc:
        raise RuntimeError(f"GitHub API HTTP {exc.code}") from None


def cloudflare_metrics(account: dict) -> list[dict]:
    """Pure: GraphQL account node -> metric rows."""
    workers = account.get("workers") or []
    d1 = account.get("d1") or []
    ai = account.get("ai") or []
    rows = [
        {"metric": "workers_requests", "value": sum(w["sum"]["requests"] for w in workers),
         "detail": {w["dimensions"]["scriptName"]: w["sum"]["requests"] for w in workers}},
        {"metric": "workers_errors", "value": sum(w["sum"]["errors"] for w in workers), "detail": None},
        {"metric": "workers_cpu_ms", "value": round(sum(w["sum"].get("cpuTimeUs", 0) for w in workers) / 1000, 1),
         "detail": {w["dimensions"]["scriptName"]: round(w["sum"].get("cpuTimeUs", 0) / 1000, 1) for w in workers}},
        {"metric": "workers_cpu_p99_ms", "value": round(max([w["quantiles"]["cpuTimeP99"] for w in workers] or [0]) / 1000, 1),
         "detail": {w["dimensions"]["scriptName"]: round(w["quantiles"]["cpuTimeP99"] / 1000, 1) for w in workers}},
        {"metric": "d1_rows_read", "value": sum(x["sum"]["rowsRead"] for x in d1),
         "detail": {x["dimensions"]["databaseId"]: x["sum"]["rowsRead"] for x in d1}},
        {"metric": "d1_rows_written", "value": sum(x["sum"]["rowsWritten"] for x in d1),
         "detail": {x["dimensions"]["databaseId"]: x["sum"]["rowsWritten"] for x in d1}},
        {"metric": "ai_neurons", "value": round(sum(x["sum"]["totalNeurons"] for x in ai), 1),
         "detail": {x["dimensions"]["modelId"]: round(x["sum"]["totalNeurons"], 1) for x in ai}},
    ]
    return rows


def actions_metrics(runs: list[dict], day: date) -> list[dict]:
    """Pure: completed workflow runs created on `day` -> wall-clock minutes per workflow."""
    per: dict[str, float] = {}
    count = 0
    for r in runs:
        if r.get("status") != "completed" or not str(r.get("created_at", "")).startswith(day.isoformat()):
            continue
        start = r.get("run_started_at") or r.get("created_at")
        end = r.get("updated_at")
        if not start or not end:
            continue
        sec = (datetime.fromisoformat(end.replace("Z", "+00:00")) -
               datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds()
        per[r.get("name") or "?"] = per.get(r.get("name") or "?", 0) + max(sec, 0) / 60
        count += 1
    return [
        {"metric": "actions_runs", "value": count, "detail": None},
        {"metric": "actions_wall_minutes", "value": round(sum(per.values()), 1),
         "detail": {k: round(v, 1) for k, v in sorted(per.items(), key=lambda kv: -kv[1])[:12]}},
    ]


def evaluate(rows: list[dict], budgets: dict) -> list[dict]:
    """Attach budget/ratio/warn; budgets come only from config, never hardcoded here."""
    limits = {**budgets.get("daily", {}), **budgets.get("per_invocation", {})}
    warn = float(budgets.get("warn_ratio", 0.8))
    out = []
    for r in rows:
        b = limits.get(r["metric"])
        ratio = (r["value"] / b) if b else None
        out.append({**r, "budget": b, "ratio": ratio, "warn": bool(ratio is not None and ratio >= warn)})
    return out


def markdown(day: date, rows: list[dict], guards: dict) -> str:
    lines = [f"### Usage {day.isoformat()} (UTC)", "", "| metric | value | budget | % |", "|---|---:|---:|---:|"]
    for r in rows:
        pct = "" if r["ratio"] is None else f"{r['ratio'] * 100:.0f}%" + (" ⚠️" if r["warn"] else "")
        lines.append(f"| {r['metric']} | {r['value']:,} | {'' if r['budget'] is None else format(r['budget'], ',')} | {pct} |")
    if guards:
        lines.append("")
        lines.append("App guards: " + ", ".join(f"{k} ≤ {v:,}" for k, v in guards.items()))
    return "\n".join(lines)


def fetch_runs(repo: str, token: str, day: date, opener=urllib_request.urlopen) -> list[dict]:
    runs: list[dict] = []
    for page in range(1, 11):
        q = urllib_parse.urlencode({"created": day.isoformat(), "per_page": 100, "page": page})
        body = _get_json(f"https://api.github.com/repos/{repo}/actions/runs?{q}", token, opener)
        batch = body.get("workflow_runs") or []
        runs += batch
        if len(batch) < 100:
            break
    return runs


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--day", default="")
    p.add_argument("--no-store", action="store_true")
    a = p.parse_args(argv)
    day = date.fromisoformat(a.day) if a.day else (datetime.now(timezone.utc).date() - timedelta(days=1))
    budgets = json.loads(BUDGETS.read_text(encoding="utf8"))
    account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    # GraphQL needs "Account Analytics: Read"; the deploy token may not have it.
    token = os.environ.get("CLOUDFLARE_ANALYTICS_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN", "")
    cf_error = None
    try:
        gql = _post_json(GRAPHQL, token, {"query": QUERY, "variables": {"acc": account_id, "d": day.isoformat()}})
        if gql.get("errors"):
            raise RuntimeError("; ".join(str(e.get("message"))[:120] for e in gql["errors"]))
        rows = cloudflare_metrics(gql["data"]["viewer"]["accounts"][0])
    except RuntimeError as exc:
        # Actions usage is still measured and stored; the run fails visibly below.
        cf_error = "Cloudflare GraphQL unavailable: " + str(exc)
        rows = []
    rows += actions_metrics(fetch_runs(os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_TOKEN"], day), day)
    rows = evaluate(rows, budgets)
    report = markdown(day, rows, budgets.get("app_guards", {}))
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf8") as f:
            f.write(report + "\n")
    if not a.no_store:
        client = D1Client(account_id, "pending", os.environ["CLOUDFLARE_D1_API_TOKEN"])
        client.database_id = client.discover_database_id("regional-osint")
        client.query(TABLE_SQL)
        now = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        for r in rows:
            client.query(UPSERT_SQL, (day.isoformat(), r["metric"], str(r["value"]),
                                      "" if r["budget"] is None else str(r["budget"]),
                                      json.dumps(r["detail"], ensure_ascii=False) if r["detail"] else "", now))
    for r in rows:
        if r["warn"]:
            print(f"::warning::{r['metric']} at {r['ratio'] * 100:.0f}% of daily budget")
    if cf_error:
        print("::error::" + cf_error + " (grant Account Analytics: Read, or set CLOUDFLARE_ANALYTICS_TOKEN)")
        return 1
    return 2 if any(r["warn"] for r in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())
