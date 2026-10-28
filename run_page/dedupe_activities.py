#!/usr/bin/env python3
"""Post-sync cleanup of cycling/running activity data.

Rules (all deterministic, idempotent):
  A  Exact COROS double-uploads: same start (<=120s), distance (<=50m) and
     moving time (<=5s) -> keep the earliest record, drop the rest.
  B1 (cycling only) Forgot-to-stop sessions: moving time > 2h AND speed < 5 km/h.
  B2 (cycling only) Multi-day rides masquerading as one activity: moving time > 12h.
  B3 Accidental tap records: distance < 100 m.

2013-era audax rides (200km+ at ~23 km/h) are intentionally kept.

Usage:
    python run_page/dedupe_activities.py            # dry-run, prints summary
    python run_page/dedupe_activities.py --execute  # apply to JSON (+ DB if present)
    python run_page/dedupe_activities.py --execute --sport running
"""

import argparse
import json
import os
import re
import sqlite3
from collections import Counter
from datetime import datetime

from config import JSON_FILE, SQL_FILE

SPEED_THRESHOLD_KMH = 5.0
DUP_START_SEC = 120
DUP_DIST_M = 50
DUP_TIME_SEC = 5


def _secs(v):
    v = str(v or "")
    m = re.match(r"(?:(\d+) day, )?(\d+):(\d+):(\d+)", v)
    if not m:
        return None
    return (
        int(m.group(1) or 0) * 86400
        + int(m.group(2)) * 3600
        + int(m.group(3)) * 60
        + float(m.group(4))
    )


def classify(activities, sport="cycling"):
    removed = []
    removed_ids = set()

    # A: exact duplicates (sport-agnostic)
    groups = {}
    for r in activities:
        groups.setdefault(r.get("start_date_local", "")[:10], []).append(r)
    for day, rs in groups.items():
        if len(rs) < 2:
            continue
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                a, b = rs[i], rs[j]
                if a["run_id"] in removed_ids or b["run_id"] in removed_ids:
                    continue
                sa, sb = _secs(a.get("moving_time")), _secs(b.get("moving_time"))
                if sa is None or sb is None:
                    continue
                try:
                    ta = datetime.strptime(
                        a["start_date_local"][:19], "%Y-%m-%d %H:%M:%S"
                    )
                    tb = datetime.strptime(
                        b["start_date_local"][:19], "%Y-%m-%d %H:%M:%S"
                    )
                except Exception:
                    continue
                if abs((ta - tb).total_seconds()) > DUP_START_SEC:
                    continue
                if (
                    abs((a.get("distance") or 0) - (b.get("distance") or 0))
                    > DUP_DIST_M
                ):
                    continue
                if abs(sa - sb) > DUP_TIME_SEC:
                    continue
                drop = b if (ta > tb or (ta == tb and a["run_id"] > b["run_id"])) else a
                if drop["run_id"] not in removed_ids:
                    removed.append(("A-dup", drop))
                    removed_ids.add(drop["run_id"])

    apply_b = sport == "cycling"
    for r in activities:
        if r["run_id"] in removed_ids:
            continue
        d = r.get("distance") or 0
        s = _secs(r.get("moving_time"))
        if s is None:
            continue
        if s > 12 * 3600 and apply_b:
            removed.append(("B2-multiday", r))
            removed_ids.add(r["run_id"])
            continue
        if s > 7200 and d > 0 and (d / s * 3.6) < SPEED_THRESHOLD_KMH and apply_b:
            removed.append(("B1-forgot-stop", r))
            removed_ids.add(r["run_id"])
            continue
        if d < 100:
            removed.append(("B3-tap", r))
            removed_ids.add(r["run_id"])
            continue

    keep_ids = {r["run_id"] for r in activities} - removed_ids
    return keep_ids, removed


def dedupe_json(json_file, removed_ids, dry_run):
    with open(json_file) as f:
        activities = json.load(f)
    before = len(activities)
    kept = [r for r in activities if r["run_id"] not in removed_ids]
    if not dry_run:
        with open(json_file, "w") as f:
            json.dump(kept, f)
    return before, len(kept)


def dedupe_sql(sql_file, removed_ids, dry_run):
    if not os.path.exists(sql_file):
        return 0, 0
    con = sqlite3.connect(sql_file)
    cur = con.cursor()
    before = cur.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
    if not dry_run and removed_ids:
        ids = list(removed_ids)
        for i in range(0, len(ids), 500):
            chunk = ids[i : i + 500]
            placeholders = ",".join("?" for _ in chunk)
            cur.execute(
                f"DELETE FROM activities WHERE run_id IN ({placeholders})", chunk
            )
        con.commit()
    after = cur.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
    con.close()
    return before, after


def dedupe_activities(
    json_file=None, sql_file=None, execute=False, quiet=False, sport="cycling"
):
    json_file = json_file or JSON_FILE
    sql_file = sql_file or SQL_FILE
    with open(json_file) as f:
        activities = json.load(f)

    keep_ids, removed = classify(activities, sport=sport)
    removed_ids = {r["run_id"] for _, r in removed}

    by_rule = Counter(rule for rule, _ in removed)

    if not quiet:
        print("=== dedupe_activities ===")
        print(f"input: {len(activities)} records  (sport={sport})")
        for rule in ("A-dup", "B1-forgot-stop", "B2-multiday", "B3-tap"):
            print(f"  {rule}: {by_rule.get(rule, 0)}")
        print(f"  total removed: {len(removed)} -> {len(activities) - len(removed)}")

    dry_run = not execute
    jb, ja = dedupe_json(json_file, removed_ids, dry_run)
    sb, sa = dedupe_sql(sql_file, removed_ids, dry_run)
    if not quiet:
        print(f"JSON: {jb} -> {ja}{' (dry-run, not written)' if dry_run else ''}")
        if os.path.exists(sql_file):
            print(f"SQL : {sb} -> {sa}{' (dry-run, not written)' if dry_run else ''}")
    return len(removed)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--execute", action="store_true", help="apply changes (default dry-run)"
    )
    ap.add_argument("--json", default=None)
    ap.add_argument("--db", default=None)
    ap.add_argument(
        "--sport", default="cycling", choices=["cycling", "running", "hiking"]
    )
    args = ap.parse_args()
    dedupe_activities(
        json_file=args.json,
        sql_file=args.db,
        execute=args.execute,
        quiet=False,
        sport=args.sport,
    )


if __name__ == "__main__":
    main()
