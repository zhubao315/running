#!/usr/bin/env python3
"""Refresh the data table in README.md from src/static/activities.json.

Keeps the GitHub repo landing page in sync with the site without hand edits.
"""

import argparse
import json
import re
from pathlib import Path

START = "<!-- STATS:START -->"
END = "<!-- STATS:END -->"

LABELS = {
    "running": "次跑步",
    "cycling": "次骑行",
    "hiking": "次徒步",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sport", choices=list(LABELS), default="running")
    parser.add_argument("--readme", default="README.md")
    args = parser.parse_args()

    activities = json.loads(Path("src/static/activities.json").read_text())
    count = len(activities)
    distance = sum(a.get("distance") or 0 for a in activities) / 1000
    climb = sum(a.get("elevation_gain") or 0 for a in activities)
    years = sorted({a["start_date_local"][:4] for a in activities})
    span = f"{years[0]}–{years[-1]}" if years else "—"
    latest = max((a["start_date_local"] for a in activities), default="—")

    if latest != "—":
        latest = latest[:10]

    climb_text = f"{round(climb):,} m" if climb else "—"
    table = "\n".join(
        [
            START,
            "| 记录 | 总里程 | 累计爬升 | 时间跨度 | 最近一次 |",
            "|---:|---:|---:|---:|---|",
            f"| {count:,} {LABELS[args.sport]} | {round(distance):,} km | "
            f"{climb_text} | {span} | {latest} |",
            END,
        ]
    )

    path = Path(args.readme)
    content = path.read_text()
    if START not in content or END not in content:
        raise SystemExit(f"stats markers missing in {path}")
    content = re.sub(
        re.escape(START) + r".*?" + re.escape(END), table, content, flags=re.S
    )
    path.write_text(content)
    print(f"updated {path}: {count} activities, {distance:.0f} km")


if __name__ == "__main__":
    main()
