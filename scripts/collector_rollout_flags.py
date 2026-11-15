"""Explicit, reviewable allowlist for source-by-source Neon/D1 primary rollout.

When selected, a source's GitHub JSON commit may be skipped ONLY after that
run's independent Neon -> private D1 readback step is successful.
No source is switched merely because it appears in this config.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from scripts.neon_mirror import SOURCE_FILES

POLICY = Path(__file__).resolve().parents[1] / "config/collector-rollout.json"


def selected_sources(path: Path = POLICY) -> set[str]:
    obj = json.loads(Path(path).read_text(encoding="utf8"))
    if not isinstance(obj, dict) or obj.get("schema_version") != 1:
        raise ValueError("invalid collector rollout schema")
    if obj.get("stage") not in ("canary", "graduated"):
        raise ValueError("invalid collector rollout stage")
    sources = obj.get("sources")
    if not isinstance(sources, list) or len(sources) > len(SOURCE_FILES):
        raise ValueError("invalid collector source allowlist")
    if any(not isinstance(x, str) or x not in SOURCE_FILES for x in sources):
        raise ValueError("unknown collector in rollout policy")
    if len(set(sources)) != len(sources):
        raise ValueError("duplicate collector in rollout policy")
    return set(sources)


def source_enabled(source_key: str, selected: set[str]) -> bool:
    if source_key not in SOURCE_FILES:
        raise ValueError("unknown source")
    return source_key in selected


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, choices=sorted(SOURCE_FILES))
    args = parser.parse_args(argv)
    enabled = source_enabled(args.source, selected_sources())
    line = "enabled=" + ("true" if enabled else "false") + "\n"
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf8") as f:
            f.write(line)
    else:
        print(line.strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
