#!/usr/bin/env python3
"""Remove running records that are the same physical activity as a hike.

The watch records a hike under a running sport type, so the COROS sync puts it
into the running dataset while the hiking site counts the same session once.
Both pages then show the distance, the moving time and the elevation, which
double-counts one activity across the two sites.

Cross-dataset matching is the only safe join key: run_id values are NOT shared
between the two repositories, so ids cannot be used, and the activity name is
not a discriminator either (a genuine 2.3 km run is also named "跑步").

  * The manifest run_page/hiking_duplicates.json lists every confirmed pair
    (running run_id -> hiking run_id) together with the evidence captured when
    the pair was verified: start_date_local, distance and moving_time on both
    sides.
  * This script re-verifies the running record against the manifest before
    deleting it: start_date_local must match within --start-tolerance seconds
    and distance within max(--min-distance metres, --distance-tolerance %).
    Anything that does not match is reported and left alone.
  * Re-running is a no-op: records already gone are reported as absent.

Fixes both src/static/activities.json and run_page/data.db so the frontend and
the DB-derived charts/parquet stay consistent, and is safe to run on every
sync because only manifest-listed ids are ever touched.

Usage:
    python run_page/exclude_hiking_dupes_rh.py                    # dry run
    python run_page/exclude_hiking_dupes_rh.py --execute          # write
    python run_page/exclude_hiking_dupes_rh.py --json ... --db ...
"""

import argparse
import json
import sqlite3
import sys
from datetime import datetime

START_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S")


def parse_start(value):
    """Parse a start_date_local string, returning None when unparseable."""
    if not value:
        return None
    for fmt in START_FORMATS:
        try:
            return datetime.strptime(str(value)[:19], fmt)
        except ValueError:
            continue
    return None


def start_delta_seconds(a, b):
    """Absolute difference in seconds, or None when either side is missing."""
    ta, tb = parse_start(a), parse_start(b)
    if ta is None or tb is None:
        return None
    return abs((ta - tb).total_seconds())


def distance_delta_m(a, b):
    if a is None or b is None:
        return None
    return abs(float(a) - float(b))


def normalize_time(value):
    """Reduce "3:02:19" and the DB's "03:02:19" / "1970-01-01 03:02:19.000000".

    Returns total seconds, or None when unparseable.
    """
    text = str(value or "").strip()
    if not text:
        return None
    if " " in text:
        text = text.split(" ", 1)[1]
    text = text.split(".", 1)[0]
    try:
        h, m, s = (int(part) for part in text.split(":"))
    except ValueError:
        return None
    return h * 3600 + m * 60 + s


def format_seconds(seconds):
    """Format total seconds as H:MM:SS (matching the JSON moving_time style)."""
    if seconds is None:
        return "—"
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}"


def verify(entry, record, args):
    """Return (ok, reason) for a JSON/DB record against a manifest entry."""
    if record is None:
        return False, "not found"

    dt = start_delta_seconds(
        record.get("start_date_local"), entry.get("start_date_local")
    )
    if dt is None:
        return False, "start_date_local unreadable"
    if dt > args.start_tolerance:
        return False, f"start time differs by {dt:.0f}s"

    dd = distance_delta_m(record.get("distance"), entry.get("distance_m"))
    if dd is None:
        return False, "distance unreadable"
    limit = max(
        args.min_distance,
        (entry.get("distance_m") or 0) * args.distance_tolerance / 100.0,
    )
    if dd > limit:
        return False, f"distance differs by {dd:.1f}m (limit {limit:.1f}m)"

    expected = normalize_time(entry.get("moving_time"))
    actual = normalize_time(record.get("moving_time"))
    if expected and actual and expected != actual:
        print(
            f"    note: moving_time differs ({format_seconds(actual)} vs manifest "
            f"{format_seconds(expected)}); start time and distance match, continuing"
        )
    return True, f"start Δ{dt:.0f}s, distance Δ{dd:.1f}m"


def load_manifest(path):
    with open(path) as f:
        data = json.load(f)
    entries = data["entries"] if isinstance(data, dict) else data
    out = []
    for raw in entries:
        if "run_id" not in raw:
            raise SystemExit(f"manifest entry without run_id: {raw!r}")
        out.append(raw)
    return out


def clean_json(path, entries, args):
    with open(path) as f:
        activities = json.load(f)
    by_id = {}
    for a in activities:
        try:
            by_id.setdefault(int(a.get("run_id")), a)
        except (TypeError, ValueError):
            continue

    remove, missing, refused = [], 0, 0
    for entry in entries:
        rid = int(entry["run_id"])
        record = by_id.get(rid)
        ok, reason = verify(entry, record, args)
        if record is None:
            missing += 1
            continue
        if not ok:
            refused += 1
            print(f"  json: run_id={rid}: REFUSED — {reason}")
            continue
        print(
            f"  json: run_id={rid} {record.get('start_date_local', '')} "
            f"{record.get('name', '')!r} {(record.get('distance') or 0) / 1000:.2f} km "
            f"— excluded ({reason})"
        )
        remove.append(rid)

    if remove and not args.execute:
        print(f"JSON: would remove {len(remove)} record(s) (dry run)")
    elif remove:
        drop = set(remove)
        kept = [a for a in activities if int(a.get("run_id")) not in drop]
        # Keep the existing on-disk formatting: compact separators, no trailing
        # newline, as written by the sync pipeline.
        with open(path, "w") as f:
            json.dump(kept, f, ensure_ascii=False, separators=(",", ":"))
        print(
            f"JSON: removed {len(remove)} of {len(activities)} record(s) "
            f"-> {len(kept)} remaining"
        )
    else:
        print("JSON: nothing to remove")
    return len(remove), missing, refused


def clean_db(path, entries, args):
    con = sqlite3.connect(path)
    cur = con.cursor()
    remove, missing, refused = [], 0, 0
    for entry in entries:
        rid = int(entry["run_id"])
        row = cur.execute(
            "SELECT run_id, start_date_local, distance, moving_time, name "
            "FROM activities WHERE run_id = ?",
            (rid,),
        ).fetchone()
        if row is None:
            missing += 1
            continue
        record = {
            "run_id": row[0],
            "start_date_local": row[1],
            "distance": row[2],
            "moving_time": row[3],
            "name": row[4],
        }
        ok, reason = verify(entry, record, args)
        if not ok:
            refused += 1
            print(f"  db: run_id={rid}: REFUSED — {reason}")
            continue
        print(f"  db: run_id={rid} {row[1]} {row[4]!r} — excluded ({reason})")
        remove.append(rid)

    if remove and not args.execute:
        print(f"DB: would remove {len(remove)} row(s) (dry run)")
    elif remove:
        cur.executemany(
            "DELETE FROM activities WHERE run_id = ?", [(rid,) for rid in remove]
        )
        con.commit()
        remaining = cur.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
        print(f"DB: removed {len(remove)} row(s) -> {remaining} remaining")
    else:
        print("DB: nothing to remove")
    con.close()
    return len(remove), missing, refused


def main():
    parser = argparse.ArgumentParser(
        description="Remove running records that duplicate a hiking activity."
    )
    parser.add_argument("--json", default="src/static/activities.json")
    parser.add_argument("--db", default="run_page/data.db")
    parser.add_argument("--manifest", default="run_page/hiking_duplicates.json")
    parser.add_argument(
        "--start-tolerance",
        type=int,
        default=180,
        help="max start time delta in seconds (default 180)",
    )
    parser.add_argument(
        "--distance-tolerance",
        type=float,
        default=2.0,
        help="max relative distance delta in percent (default 2.0)",
    )
    parser.add_argument(
        "--min-distance",
        type=float,
        default=50.0,
        help="absolute distance tolerance floor in metres (default 50)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="actually write the files (default is a dry run)",
    )
    args = parser.parse_args()

    entries = load_manifest(args.manifest)
    print(
        f"Manifest {args.manifest}: {len(entries)} entr(ies); "
        f"mode={'EXECUTE' if args.execute else 'DRY RUN'}"
    )

    json_removed, json_missing, json_refused = clean_json(args.json, entries, args)
    db_removed, db_missing, db_refused = clean_db(args.db, entries, args)

    print(
        f"\nSummary: JSON {json_removed} removed / {json_missing} absent / "
        f"{json_refused} refused; DB {db_removed} removed / {db_missing} absent / "
        f"{db_refused} refused"
    )
    if json_refused or db_refused:
        print(
            "Refused records were left untouched — re-check the manifest "
            "evidence if a record legitimately changed.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
