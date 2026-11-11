"""Sync terrain-record fields from activities.json into run_page/data.db.

The FIT/GPX rebuild regenerates both files from source, so every backfilled
field must live in both places (same pattern as sync_elevation_db.py).

Rows are matched by start_date, not run_id: some imported activities carry
64-bit run IDs beyond JS/JSON numeric precision, so the JSON copy of those IDs
gets rounded on serialization and differs from the exact INTEGER in SQLite.
start_date is unique and identical in both sources (verified across the full
344-row set).
"""

import json, sqlite3, sys
from pathlib import Path

root = Path(sys.argv[1])
acts = json.loads((root / "src/static/activities.json").read_text())
db = sqlite3.connect(root / "run_page/data.db")

existing = [r[1] for r in db.execute("PRAGMA table_info(activities)")]
for field in ("elevation_gain", "climb_terrain", "altitude_max"):
    if field not in existing:
        db.execute(f"ALTER TABLE activities ADD COLUMN {field} FLOAT")
        print(f"added {field} column")

# run_id → start_date map: JSON rows (matched by start_date) update the DB row
# with the exact run_id SQLite holds
dates = {r[1]: r[0] for r in db.execute("SELECT run_id, start_date FROM activities")}

for field in ("elevation_gain", "climb_terrain", "altitude_max"):
    rows = [
        (float(a[field]), dates[a["start_date"]])
        for a in acts
        if a.get(field) is not None and a.get("start_date") in dates
    ]
    db.executemany(f"UPDATE activities SET {field}=? WHERE run_id=?", rows)
    print(f"{root.name}: {field} set on {len(rows)} rows")
db.commit()
