#!/usr/bin/env python3
"""Remove confirmed GPS-drift components from specific activities.

Targeted variant of fix_gps_drift.py for running/hiking data, where the
"keep the largest cluster" rule is NOT safe (real GPS-dropout segments in
mountain hikes would be destroyed).  Instead each allowlisted run_id carries
an explicit list of component indices to drop, where components are chained
in track order by hops of at most --threshold metres.

Safety guards before a component is dropped:
  * it must be detached from its neighbours by more than --min-gap km, and
  * it must be shorter than --max-len km and cover < half of the track
    points, and
  * its observed point count must be within --tolerance of the expected
    count recorded in the drop spec (when non-zero).

Fixes both src/static/activities.json and run_page/data.db so the frontend
map and the DB-derived charts/parquet stay consistent.  Activities not on
the allowlist are never modified, so the script is safe to run on every
sync.

Usage:
    python run_page/fix_gps_drift_rh.py \
        --json src/static/activities.json --db run_page/data.db \
        --drop 232036223:0@264 --drop 9223370520777606807:1@2 \
        --drop 20285755:1@191 --drop 55972441:1@172 [--dry-run]

    --drop spec format: run_id:component_index[@expected_points]

Whole-activity removal (for confirmed phantom records, e.g. a COROS watch
session whose metadata drifted into 10h moving_time / 30 min/km pace):

    --delete 9223370440357779707
"""

import argparse
import json
import math
import sqlite3
import sys

import polyline


def _dist_km(a, b):
    """Haversine distance in km."""
    lat1, lon1 = a
    lat2, lon2 = b
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(h)))


def split_components(points, threshold_km):
    """Split points into track-order components chained by <=threshold hops."""
    comps = [[0]]
    for i in range(1, len(points)):
        if _dist_km(points[i - 1], points[i]) <= threshold_km:
            comps[-1].append(i)
        else:
            comps.append([i])
    return comps


def comp_len_km(points, comp):
    return sum(_dist_km(points[i], points[j]) for i, j in zip(comp, comp[1:]))


def drop_specified_components(points, comp_idx, expected_pts, args, label):
    """Return (filtered_points, n_dropped) or (points, 0) on any refusal."""
    n = len(points)
    comps = split_components(points, args.threshold / 1000.0)
    if comp_idx >= len(comps):
        print(
            f"    !! {label}: only {len(comps)} component(s), "
            f"cannot drop #{comp_idx} — skipped"
        )
        return points, 0
    comp = comps[comp_idx]
    size = len(comp)
    if expected_pts and abs(size - expected_pts) > args.tolerance * expected_pts:
        print(
            f"    !! {label}: component #{comp_idx} has {size} points, "
            f"expected ~{expected_pts} — refusing to drop"
        )
        return points, 0
    length = comp_len_km(points, comp)
    gap_in = (
        0.0
        if comp_idx == 0
        else _dist_km(points[comps[comp_idx - 1][-1]], points[comp[0]])
    )
    gap_out = (
        0.0
        if comp_idx == len(comps) - 1
        else _dist_km(points[comp[-1]], points[comps[comp_idx + 1][0]])
    )
    if max(gap_in, gap_out) <= args.min_gap:
        print(
            f"    !! {label}: component #{comp_idx} not detached "
            f"(gap {max(gap_in, gap_out):.2f} km) — refusing to drop"
        )
        return points, 0
    if length > args.max_len or size * 2 >= n:
        print(
            f"    !! {label}: component #{comp_idx} too large "
            f"({length:.2f} km, {size}/{n} pts) — refusing to drop"
        )
        return points, 0
    keep = [i for c_i, c in enumerate(comps) if c_i != comp_idx for i in c]
    print(
        f"    drop: {label} component #{comp_idx}: {size} pts, "
        f"{length:.2f} km, gap_in={gap_in:.2f} gap_out={gap_out:.2f}"
    )
    return [points[i] for i in keep], size


def fix_polyline(poly_str, drops, args, label):
    if not poly_str:
        return poly_str, 0
    try:
        pts = polyline.decode(poly_str)
    except Exception:
        return poly_str, 0
    comp_idx, expected = drops
    filtered, dropped = drop_specified_components(pts, comp_idx, expected, args, label)
    if not dropped:
        return poly_str, 0
    if not filtered:
        return poly_str, dropped
    return polyline.encode(filtered, 5), dropped


def parse_drops(items):
    drops = {}
    for item in items:
        for part in item.split(","):
            part = part.strip()
            if not part:
                continue
            spec = part.split(":")
            rid = int(spec[0])
            idx_part = spec[1]
            expected = 0
            if "@" in idx_part:
                idx_part, exp = idx_part.split("@", 1)
                expected = int(exp)
            idx = int(idx_part)
            drops.setdefault(rid, []).append((idx, expected))
    return drops


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", default="src/static/activities.json")
    parser.add_argument("--db", default="run_page/data.db")
    parser.add_argument(
        "--drop",
        action="append",
        default=[],
        help="run_id:component_index[@expected_points]; repeatable",
    )
    parser.add_argument(
        "--delete",
        action="append",
        default=[],
        help="run_id whose whole activity should be removed; repeatable",
    )
    parser.add_argument(
        "--threshold", type=int, default=3000, help="chain threshold in metres"
    )
    parser.add_argument(
        "--min-gap", type=float, default=1.0, help="min detachment gap in km"
    )
    parser.add_argument(
        "--max-len",
        type=float,
        default=2.0,
        help="max droppable component length in km",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.3,
        help="relative tolerance on expected point count",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    drops = parse_drops(args.drop)
    deletes = {int(i) for i in args.delete}
    if not drops and not deletes:
        print("No --drop spec given; nothing to do.")
        return 0

    # --- JSON ---
    with open(args.json) as f:
        activities = json.load(f)
    json_changed = 0
    for a in activities:
        rid = int(a.get("run_id"))
        if rid not in drops:
            continue
        for comp_idx, expected in drops[rid]:
            label = f"json run_id={rid}"
            old = a.get("summary_polyline")
            new, dropped = fix_polyline(old, (comp_idx, expected), args, label)
            if dropped:
                print(
                    f"  json: run_id={rid} "
                    f"{a.get('start_date_local', '')} "
                    f"{a.get('name', '')!r}: drop {dropped} point(s)"
                )
                if not args.dry_run:
                    a["summary_polyline"] = new
                json_changed += 1
    for a in list(activities):
        rid = int(a.get("run_id"))
        if rid not in deletes:
            continue
        print(
            f"  json: run_id={rid} {a.get('start_date_local', '')} "
            f"{a.get('name', '')!r}: deleted whole activity"
        )
        json_changed += 1
        if not args.dry_run:
            activities.remove(a)
    if not args.dry_run and json_changed:
        with open(args.json, "w") as f:
            json.dump(activities, f)
    print(f"JSON: {json_changed} activity(ies) cleaned")

    # --- DB ---
    try:
        con = sqlite3.connect(args.db)
        cur = con.cursor()
        db_changed = 0
        for rid, comp_drops in drops.items():
            row = cur.execute(
                "SELECT summary_polyline FROM activities WHERE run_id = ?",
                (rid,),
            ).fetchone()
            if not row:
                print(f"  db: run_id={rid}: not found")
                continue
            new, _ = row[0], None
            changed_pts = 0
            for comp_idx, expected in comp_drops:
                label = f"db run_id={rid}"
                new, dropped = fix_polyline(new, (comp_idx, expected), args, label)
                changed_pts += dropped
            if changed_pts:
                print(f"  db: run_id={rid}: drop {changed_pts} point(s) total")
                if not args.dry_run:
                    cur.execute(
                        "UPDATE activities SET summary_polyline = ? "
                        "WHERE run_id = ?",
                        (new, rid),
                    )
                db_changed += 1
        for rid in sorted(deletes):
            row = cur.execute(
                "SELECT 1 FROM activities WHERE run_id = ?", (rid,)
            ).fetchone()
            if not row:
                print(f"  db: run_id={rid}: not found")
                continue
            print(f"  db: run_id={rid}: deleted whole activity")
            db_changed += 1
            if not args.dry_run:
                cur.execute("DELETE FROM activities WHERE run_id = ?", (rid,))
        if not args.dry_run:
            con.commit()
        con.close()
        print(f"DB: {db_changed} row(s) cleaned")
    except Exception as exc:
        print(f"DB update skipped/failed: {exc}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
