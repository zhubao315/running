#!/usr/bin/env python3
"""Restore JS-rounded run_ids in the published JSON from the DB.

Node scripts that rewrite src/static/activities.json through JSON.parse hold
no integer above 2**53: the 19-digit COROS ids come back as the nearest IEEE
double and are written back rounded ("...807" -> "...000"). The page lives
with it — the browser parses the JSON the same way, and the baked scenes are
keyed by the rounded form — but the Python steps that join the JSON with
run_page/data.db on run_id do not: the integrity gate reports the rounded
ids as precision losses and fails the sync, and an id allowlist such as
fix_gps_drift_rh.py's silently misses JSON records it should touch.

run_page/data.db is the source of truth (a SQLite INTEGER holds every id
exactly), so the JSON is restored from it. The join key is start_date,
unique and identical across both sources — the same key
scripts/sync_scene_records_db.py relies on. Only precision losses are
rewritten: a JSON id whose float disagrees with its DB partner is a real
drift, reported for the integrity gate to explain rather than rewritten.
The id digits are replaced inside the JSON text, so the file's byte style
is left untouched.

Usage:
    python run_page/repair_run_ids_rh.py            # report only
    python run_page/repair_run_ids_rh.py --execute  # write back
"""

import argparse
import json
import re
import sqlite3

DEFAULT_JSON = "src/static/activities.json"
DEFAULT_DB = "run_page/data.db"

RUN_ID = re.compile(r'"run_id":\s*(-?\d+)')


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", default=DEFAULT_JSON)
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="write the repaired JSON back (default: report only)",
    )
    args = parser.parse_args()

    with open(args.json, encoding="utf-8") as handle:
        text = handle.read()
    records = json.loads(text)

    connection = sqlite3.connect(args.db)
    try:
        pairs = connection.execute(
            "select run_id, start_date from activities"
        ).fetchall()
    finally:
        connection.close()
    if len({start for _, start in pairs}) != len(pairs):
        raise SystemExit("repair: start_date is not unique in the DB")
    exact = {start: run_id for run_id, start in pairs}

    matches = list(RUN_ID.finditer(text))
    if len(matches) != len(records):
        raise SystemExit(
            f"repair: {len(matches)} run_id tokens vs {len(records)} records, "
            "the JSON is not the flat list this script expects"
        )

    repaired = 0
    drifted = []
    unpaired = []
    chunks = []
    position = 0
    for match, record in zip(matches, records):
        written = int(match.group(1))
        truth = exact.get(record.get("start_date"))
        if truth is None:
            unpaired.append(record.get("run_id"))
        elif written != truth and float(written) == float(truth):
            chunks.append(text[position : match.start(1)])
            chunks.append(str(truth))
            position = match.end(1)
            repaired += 1
        elif written != truth:
            drifted.append((record.get("run_id"), truth))
    chunks.append(text[position:])

    print(f"repair: {repaired} run_id(s) restored from the DB")
    for run_id, truth in drifted[:10]:
        print(
            f"repair: not a precision loss, left alone: JSON {run_id} " f"vs DB {truth}"
        )
    if len(drifted) > 10:
        print(f"repair: ... and {len(drifted) - 10} more drifts")
    for run_id in unpaired[:10]:
        print(f"repair: no DB row with this start_date, left alone: {run_id}")

    if repaired and args.execute:
        with open(args.json, "w", encoding="utf-8") as handle:
            handle.write("".join(chunks))
        print(f"repair: wrote {args.json}")
    elif repaired:
        print(f"repair: {repaired} change(s) pending, re-run with --execute")


if __name__ == "__main__":
    main()
