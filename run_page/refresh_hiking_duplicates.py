#!/usr/bin/env python3
"""Discover running records that duplicate a hiking activity, automatically.

The watch files a hike under a running sport type, so the same session lands in
both repositories. run_page/exclude_hiking_dupes_rh.py removes the duplicates
but only ever touches ids listed in run_page/hiking_duplicates.json, which used
to be maintained by hand. This script maintains that manifest: it re-runs the
cross-dataset match against the hiking site's live dataset and appends any new
pair, so a hike taken next week is excluded without anyone noticing it first.

Matching is the only safe join key. run_id values are NOT shared between the
two repositories, and the activity name is not a discriminator either (a
genuine 2.3 km run is also named "跑步"). A pair is a duplicate when
|start_date_local delta| <= --start-tolerance seconds AND distance delta <=
max(--min-distance metres, --distance-tolerance %). On the 2026-11-02 snapshot
this reproduced all 15 confirmed pairs with a 0 s and 0.0 m delta, and matched
none of the 2,035 genuine runs.

Entries are only ever added. An entry whose running record is absent from the
dataset is the exclusion itself, so deleting it would resurrect the record on
the next rebuild.

Usage:
    python run_page/refresh_hiking_duplicates.py                 # dry run
    python run_page/refresh_hiking_duplicates.py --execute       # write
    python run_page/refresh_hiking_duplicates.py --execute --soft-fail   # in CI
    python run_page/refresh_hiking_duplicates.py --hiking-json https://raw.
      githubusercontent.com/zhubao315/hiking/main/src/static/activities.json
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime

START_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S")

DEFAULT_MANIFEST = "run_page/hiking_duplicates.json"
DEFAULT_RUNNING = "src/static/activities.json"
DEFAULT_HIKING_URL = (
    "https://raw.githubusercontent.com/zhubao315/hiking/main/src/static/activities.json"
)


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


def load_activities(source):
    """Read an activities dataset from a local path or an HTTP(S) URL."""
    if source.startswith(("http://", "https://")):
        request = urllib.request.Request(
            source, headers={"User-Agent": "running-site dedupe"}
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    with open(source, encoding="utf-8") as handle:
        return json.load(handle)


def find_duplicates(runs, hikes, args):
    """Return duplicate pairs as manifest entries, newest last."""
    parsed_hikes = []
    for hike in hikes:
        when = parse_start(hike.get("start_date_local"))
        if when is None or not hike.get("distance"):
            continue
        parsed_hikes.append((when, hike))

    entries = []
    for run in runs:
        when = parse_start(run.get("start_date_local"))
        if when is None or not run.get("distance"):
            continue
        for hike_when, hike in parsed_hikes:
            delta_start = abs((when - hike_when).total_seconds())
            if delta_start > args.start_tolerance:
                continue
            delta_distance = abs(run["distance"] - hike["distance"])
            limit = max(
                args.min_distance,
                args.distance_tolerance
                / 100.0
                * max(run["distance"], hike["distance"]),
            )
            if delta_distance > limit:
                continue
            entries.append(
                {
                    "run_id": run["run_id"],
                    "start_date_local": run["start_date_local"],
                    "distance_m": run["distance"],
                    "moving_time": run.get("moving_time"),
                    "hiking_run_id": hike["run_id"],
                    "hiking_distance_m": hike["distance"],
                    "hiking_moving_time": hike.get("moving_time"),
                }
            )
            break
    return entries


def main():
    parser = argparse.ArgumentParser(
        description="Auto-maintain the hiking duplicate manifest."
    )
    parser.add_argument("--running-json", default=DEFAULT_RUNNING)
    parser.add_argument("--hiking-json", default=DEFAULT_HIKING_URL)
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument("--start-tolerance", type=int, default=180)
    parser.add_argument("--distance-tolerance", type=float, default=2.0)
    parser.add_argument("--min-distance", type=float, default=50.0)
    parser.add_argument(
        "--execute", action="store_true", help="write the manifest (default: dry run)"
    )
    parser.add_argument(
        "--soft-fail",
        action="store_true",
        help="warn instead of exiting non-zero when the hiking dataset is unreadable, "
        "so a transient fetch error cannot block the deploy; the manifest then stays "
        "exactly as committed, which is the pre-automation behaviour",
    )
    args = parser.parse_args()

    with open(args.manifest, encoding="utf-8") as handle:
        manifest = json.load(handle)

    known = manifest.get("entries", [])
    known_ids = {entry["run_id"] for entry in known}

    def abort(message):
        print(f"REFRESH ABORTED: {message}", file=sys.stderr)
        if args.soft_fail:
            print("REFRESH SKIPPED (--soft-fail): keeping the manifest as committed")
            return 0
        return 1

    try:
        runs = load_activities(args.running_json)
        hikes = load_activities(args.hiking_json)
    except (urllib.error.URLError, OSError) as error:
        return abort(f"cannot read input ({error})")

    if not isinstance(runs, list) or not isinstance(hikes, list) or not hikes:
        return abort("unexpected dataset shape")

    found = find_duplicates(runs, hikes, args)
    new_entries = [entry for entry in found if entry["run_id"] not in known_ids]
    carried = sorted(known_ids - {entry["run_id"] for entry in found})

    print(
        f"running={len(runs)} hiking={len(hikes)} "
        f"matched={len(found)} new={len(new_entries)} "
        f"already-excluded={len(carried)} manifest={len(known)}"
    )
    for entry in new_entries:
        print(
            f"  NEW  run_id={entry['run_id']} {entry['start_date_local']} "
            f"{entry['distance_m'] / 1000:.2f}km <-> hiking run_id={entry['hiking_run_id']}"
        )

    if not new_entries:
        print("manifest unchanged")
        return 0

    if not args.execute:
        print("DRY RUN: pass --execute to write the manifest")
        return 0

    merged = known + new_entries
    merged.sort(key=lambda entry: str(entry.get("start_date_local") or ""))
    manifest["entries"] = merged
    manifest["matched_on"] = datetime.now().strftime("%Y-%m-%d")
    manifest["hiking_source"] = (
        f"{args.hiking_json} ({len(hikes)} records, snapshot {manifest['matched_on']})"
    )
    manifest["hiking_source_totals"] = (
        f"{len(hikes)} records, {sum(h.get('distance', 0) for h in hikes) / 1000:,.1f} km"
    )
    with open(args.manifest, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"wrote {args.manifest}: {len(known)} -> {len(merged)} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
