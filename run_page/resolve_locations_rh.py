#!/usr/bin/env python3
"""Fill in locations for records that only have a GPS track, offline.

The watch stores a place name on most activities, but a sizeable share of the
history has no `location_country` at all while still carrying a
`summary_polyline`: 94 of 2,035 runs, 4,794 of 7,915 rides and 169 of 344
hikes as of 2026-11-05. Those records are invisible to the geographic module —
they count in the totals but appear on no map and in no province list.

This script resolves them from the track itself, with no network call and no
geocoder: the start coordinate is tested against two boundary layers the repo
carries under `run_page/assets/` — the 34 province polygons the site already
ships (extracted from `src/static/run_countries.ts`) and, for anything outside
them, the public-domain country polygons of `@surbowl/world-geo-json-zh`
(Natural Earth, vendored with the China feature removed because the province
layer is finer). A hit becomes `location_resolved`, formatted exactly like a
device-written address tail — "陕西省, 中国" for a Chinese track, "日本" for a
foreign one — so the existing frontend parsers read it unchanged.

`location_country` is never written: records keep the device value wherever one
exists, the derived value lives in its own field, and a track with no GPS at all
stays unplaced rather than being guessed from the user's usual city. `--verify`
scores the resolver against the records that DO carry a device location, which
is how accuracy was established before anything was ever written.

Runs on `src/static/activities.json` and mirrors the same values into
`run_page/data.db` (the column is created on first run), the way the other
`*_rh.py` maintenance scripts do, so a full rebuild cannot leave the two out of
step. Nothing DB-derived today reads a location, but keeping them together costs
one UPDATE and removes a class of "the JSON said one thing, the DB another".

Usage:
    python run_page/resolve_locations_rh.py --verify     # accuracy, writes nothing
    python run_page/resolve_locations_rh.py              # dry run: what would change
    python run_page/resolve_locations_rh.py --execute    # write JSON and DB
"""

import argparse
import json
import os
import re
import sqlite3
import sys

DEFAULT_JSON = "src/static/activities.json"
DEFAULT_DB = "run_page/data.db"
DEFAULT_BOUNDARIES = "run_page/assets/china_provinces.json"
DEFAULT_COUNTRIES = "run_page/assets/world_countries.json"

# A device address ends with the province, e.g. "长安区, 西安市, 陕西省, 710124,
# 中国"; the same two regexes the frontend uses.
PROVINCE_RE = re.compile(r"[一-龥]{2,}(省|自治区)")
MUNICIPALITY_RE = re.compile(r"(北京|天津|上海|重庆)市")
# Foreign device strings name the country last, in Chinese: "…東京都, 100-0003,
# 日本". Dict-repr records carry an explicit 'country' key.
DEVICE_COUNTRY_RE = re.compile(r"[一-龥]{2,}\s*$")
DICT_COUNTRY_RE = re.compile(r"'country':\s*'([^']+)'")


def decode_polyline(encoded):
    """Google encoded polyline (precision 5) to a list of (lat, lng) pairs."""
    points = []
    lat = 0
    lng = 0
    i = 0
    n = len(encoded)
    while i < n:
        coords = []
        for _ in range(2):
            result = 0
            shift = 0
            while True:
                if i >= n:
                    return points
                byte = ord(encoded[i]) - 63
                i += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 32:
                    break
            coords.append(~(result >> 1) if (result & 1) else (result >> 1))
        lat += coords[0]
        lng += coords[1]
        points.append((lat / 1e5, lng / 1e5))
    return points


def load_boundaries(path):
    """Return [(name, polygons, bbox)] where polygons are (outer, holes) pairs."""
    with open(path, encoding="utf-8") as handle:
        geojson = json.load(handle)
    shapes = []
    for feature in geojson["features"]:
        name = feature["properties"]["name"]
        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "Polygon":
            polys = [geometry["coordinates"]]
        elif geometry.get("type") == "MultiPolygon":
            polys = geometry["coordinates"]
        else:
            continue
        polygons = []
        west = south = east = north = None
        for polygon in polys:
            rings = [
                [(lng, lat) for lat, lng in ring] for ring in polygon if len(ring) >= 4
            ]
            if not rings:
                continue
            polygons.append((rings[0], rings[1:]))
            for ring in rings:
                for x, y in ring:
                    if west is None:
                        west = east = x
                        south = north = y
                    else:
                        west, east = min(west, x), max(east, x)
                        south, north = min(south, y), max(north, y)
        if polygons and west is not None:
            shapes.append((name, polygons, (west, south, east, north)))
    return shapes


def in_ring(ring, point):
    """Ray casting on one linear ring."""
    x, y = point
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def resolve(shapes, point):
    """Province name containing the point, or None when it is outside China."""
    if point is None:
        return None
    x, y = point
    for name, polygons, (west, south, east, north) in shapes:
        if not (west <= x <= east and south <= y <= north):
            continue
        for outer, holes in polygons:
            if not in_ring(outer, point):
                continue
            if any(in_ring(hole, point) for hole in holes):
                continue
            return name
    return None


def start_point(record):
    points = decode_polyline(record.get("summary_polyline") or "")
    return points[0] if points else None


def median_point(record):
    points = decode_polyline(record.get("summary_polyline") or "")
    if not points:
        return None
    lats = sorted(p[0] for p in points)
    lngs = sorted(p[1] for p in points)
    middle = len(points) // 2
    return (lats[middle], lngs[middle])


def device_province(record):
    """Province the device string names, normalised to a boundary name."""
    raw = record.get("location_country") or ""
    municipality = MUNICIPALITY_RE.search(raw)
    if municipality:
        return municipality.group(1) + "市"
    match = PROVINCE_RE.search(raw)
    return match.group(0) if match else None


def device_place(record):
    """The place the device string states, spelled the way this writes it."""
    raw = (record.get("location_country") or "").strip()
    if not raw:
        return None
    province = device_province(record)
    if province:
        return f"{province}, 中国"
    dict_country = DICT_COUNTRY_RE.search(raw)
    if dict_country and dict_country.group(1) != "中国":
        return dict_country.group(1)
    country = DEVICE_COUNTRY_RE.search(raw.rstrip(",").rstrip())
    if country and country.group(0) != "中国":
        return country.group(0)
    return None


def place(record, shapes, countries):
    """(location, how) resolved from the track, or (None, why) when unplaceable."""
    if not record.get("summary_polyline"):
        return None, "no track"
    for how, point in (
        ("start", start_point(record)),
        ("median", median_point(record)),
    ):
        if point is None:
            return None, "unreadable track"
        province = resolve(shapes, point)
        if province:
            return f"{province}, 中国", how
        country = resolve(countries, point)
        if country:
            return country, how
    return None, "outside every boundary"


def sync_database(path, values):
    """Mirror the derived locations into the activities table.

    The column is created when absent: the sync builds the DB from its own
    model, which knows nothing about derived fields. Returns None when the
    table is not there at all.
    """
    connection = sqlite3.connect(path)
    try:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(activities)")
        }
        if not columns:
            return None
        if "location_resolved" not in columns:
            connection.execute(
                "ALTER TABLE activities ADD COLUMN location_resolved TEXT"
            )
        updated = missing = 0
        for run_id, value in values.items():
            # the three repositories store run_id with different affinities
            for candidate in (run_id, str(run_id)):
                cursor = connection.execute(
                    "UPDATE activities SET location_resolved = ? WHERE run_id = ?",
                    (value, candidate),
                )
                if cursor.rowcount:
                    break
            if cursor.rowcount:
                updated += 1
            else:
                missing += 1
        connection.commit()
        return updated, missing
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", default=DEFAULT_JSON)
    parser.add_argument("--boundaries", default=DEFAULT_BOUNDARIES)
    parser.add_argument("--countries", default=DEFAULT_COUNTRIES)
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument(
        "--verify",
        action="store_true",
        help="score the resolver against records that already have a device "
        "location and change nothing",
    )
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()

    shapes = load_boundaries(args.boundaries)
    countries = load_boundaries(args.countries)
    with open(args.json, encoding="utf-8") as handle:
        records = json.load(handle)
    if not isinstance(records, list):
        raise SystemExit("REFUSED: expected a list of activities")
    print(
        f"boundaries: {len(shapes)} provinces + {len(countries)} countries | "
        f"records: {len(records)}"
    )

    if args.verify:
        agree = disagree = no_device_place = unplaced = 0
        mismatches = []
        scored = 0
        for record in records:
            if not record.get("location_country") or not record.get("summary_polyline"):
                continue
            scored += 1
            wanted = device_place(record)
            got, _ = place(record, shapes, countries)
            if wanted is None:
                no_device_place += 1
                continue
            if got is None:
                unplaced += 1
                continue
            if got == wanted:
                agree += 1
            else:
                disagree += 1
                if len(mismatches) < 8:
                    mismatches.append(
                        (
                            record["run_id"],
                            record["start_date_local"][:10],
                            wanted,
                            got,
                        )
                    )
        comparable = agree + disagree
        print(
            f"verify: {scored} records have both a device location and a track; "
            f"device string names no comparable place: {no_device_place}; "
            f"track outside every boundary: {unplaced}"
        )
        for row in mismatches:
            print("   mismatch", row)
        if not comparable:
            raise SystemExit("REFUSED: nothing to verify against")
        ratio = agree / comparable
        print(f"accuracy: {ratio:.4f} ({agree}/{comparable})")
        return 0 if ratio >= 0.95 else 1

    without = already = 0
    by_place = {}
    by_stage = {}
    changes = []
    for record in records:
        if record.get("location_country"):
            continue
        without += 1
        if record.get("location_resolved"):
            already += 1
        value, how = place(record, shapes, countries)
        if value is None:
            by_stage[how] = by_stage.get(how, 0) + 1
            continue
        by_place[value] = by_place.get(value, 0) + 1
        by_stage[how] = by_stage.get(how, 0) + 1
        changes.append((record, value))

    print(
        f"records without a device location: {without} "
        f"(of which already carrying a derived one: {already})"
    )
    print(f"resolvable: {len(changes)} | unplaced: {without - len(changes)}")
    for how, count in sorted(by_stage.items(), key=lambda kv: -kv[1]):
        print(f"   point used / why not: {how}: {count}")
    for name, count in sorted(by_place.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"   {name}: {count}")
    if not changes:
        print("nothing to write")
        return 0
    for record, value in changes[:5]:
        print(
            f"   e.g. {record['run_id']} {record['start_date_local'][:10]} -> {value}"
        )
    if not args.execute:
        print("DRY RUN: pass --execute to write")
        return 0

    for record, value in changes:
        record["location_resolved"] = value
    with open(args.json, "w", encoding="utf-8") as handle:
        json.dump(records, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"wrote {len(changes)} derived location(s) into {args.json}")

    if not os.path.exists(args.db):
        print(f"database {args.db} not present; JSON only this run")
        return 0
    result = sync_database(
        args.db, {record["run_id"]: value for record, value in changes}
    )
    if result is None:
        print(f"database {args.db} has no activities table; JSON only this run")
    else:
        updated, missing = result
        print(
            f"database {args.db}: {updated} row(s) updated, {missing} run_id(s) absent"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
