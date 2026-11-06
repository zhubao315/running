#!/usr/bin/env python3
"""Fail a deploy when the published JSON and the DB disagree.

Every number on these three sites comes from `src/static/activities.json`,
while `run_page/data.db` is what the sync built it from. The two are supposed to
be the same records; in practice they have drifted apart more than once — a
float64 round trip rewrote 84 hiking ids, and a half-finished rebuild once left
the JSON ahead of the DB. Neither is visible on the page: the site renders
confidently from whichever file it was given.

This is the gate that catches it before the artefact is uploaded. It compares
the two sources on identity (every `run_id`, in both directions), on the values
the page aggregates (distance, start time) and on the totals those aggregate to,
then reports how much of the dataset carries a location and where it came from.

`run_id` above 2^53 is checked specifically: those are the ids an IEEE double
cannot hold, so a JSON id that is not in the DB but shares a double with a DB id
that is not in the JSON is reported as precision loss rather than a missing
record.

Usage:
    python run_page/check_data_integrity_rh.py
    python run_page/check_data_integrity_rh.py --warn-only   # report, exit 0
"""

import argparse
import json
import sqlite3
import sys

DEFAULT_JSON = "src/static/activities.json"
DEFAULT_DB = "run_page/data.db"
FLOAT_LIMIT = 2**53


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", default=DEFAULT_JSON)
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument(
        "--warn-only",
        action="store_true",
        help="report but exit 0, for a repository whose repair has not landed yet",
    )
    parser.add_argument("--sport", default="activity")
    args = parser.parse_args()

    problems = []
    with open(args.json, encoding="utf-8") as handle:
        records = json.load(handle)
    if not isinstance(records, list) or not records:
        raise SystemExit("integrity: dataset is not a non-empty list")

    connection = sqlite3.connect(args.db)
    try:
        columns = [
            row[1] for row in connection.execute("PRAGMA table_info(activities)")
        ]
        if not columns:
            raise SystemExit("integrity: the DB has no activities table")
        rows = {
            row[0]: row
            for row in connection.execute(
                "select run_id, start_date_local, distance, location_country"
                + (", location_resolved" if "location_resolved" in columns else "")
                + " from activities"
            )
        }
    finally:
        connection.close()

    json_ids = [record["run_id"] for record in records]
    if len(set(json_ids)) != len(json_ids):
        problems.append(
            f"duplicate run_id in JSON: {len(json_ids) - len(set(json_ids))}"
        )
    if len(rows) != len(json_ids):
        problems.append(f"record count: JSON {len(json_ids)} vs DB {len(rows)}")

    missing_in_db = [run_id for run_id in json_ids if run_id not in rows]
    missing_in_json = [run_id for run_id in rows if run_id not in set(json_ids)]
    rounded = [
        run_id
        for run_id in missing_in_db
        if run_id > FLOAT_LIMIT and any(float(other) == float(run_id) for other in rows)
    ]
    if missing_in_db:
        problems.append(
            f"{len(missing_in_db)} JSON run_id(s) absent from the DB"
            + (
                f" — {len(rounded)} of them are float64 precision losses "
                "(an id above 2^53 rewritten by a double round trip)"
                if rounded
                else ""
            )
        )
    if missing_in_json:
        problems.append(f"{len(missing_in_json)} DB run_id(s) absent from the JSON")

    by_id = {record["run_id"]: record for record in records}
    distance_bad = time_bad = 0
    for run_id, row in rows.items():
        record = by_id.get(run_id)
        if record is None:
            continue
        if abs(float(record["distance"]) - float(row[2] or 0)) > 0.01:
            distance_bad += 1
        if str(record.get("start_date_local"))[:19] != str(row[1])[:19]:
            time_bad += 1
    if distance_bad:
        problems.append(f"{distance_bad} shared record(s) disagree on distance")
    if time_bad:
        problems.append(f"{time_bad} shared record(s) disagree on start time")

    json_distance = sum(record.get("distance") or 0 for record in records)
    db_distance = sum(row[2] or 0 for row in rows.values())
    if abs(json_distance - db_distance) > 1.0:
        problems.append(
            f"total distance: JSON {json_distance / 1000:.2f} km vs "
            f"DB {db_distance / 1000:.2f} km"
        )

    device = sum(1 for record in records if record.get("location_country"))
    derived = sum(
        1
        for record in records
        if not record.get("location_country") and record.get("location_resolved")
    )
    track = sum(1 for record in records if record.get("summary_polyline"))
    print(
        f"{args.sport}: {len(records)} records, "
        f"{json_distance / 1000:,.1f} km, {track} with a GPS track"
    )
    print(
        f"   locations: {device} from the device, {derived} resolved from the "
        f"track, {len(records) - device - derived} with neither"
    )
    if "location_resolved" in columns:
        db_derived = sum(1 for row in rows.values() if row[4])
        if db_derived != derived:
            # Not a failure: the resolver can only mirror a derived location into
            # a DB row whose run_id it can match, so corrupted ids leave the DB
            # behind by exactly that count. The id check above is what reports
            # the real problem.
            print(
                f"   note: DB carries {db_derived} derived location(s) vs "
                f"{derived} in the JSON"
            )

    if not problems:
        print("integrity: OK")
        return 0
    for problem in problems:
        print(f"integrity FAIL: {problem}", file=sys.stderr)
    return 0 if args.warn_only else 1


if __name__ == "__main__":
    sys.exit(main())
