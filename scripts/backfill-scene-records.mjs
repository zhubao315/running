// Backfill terrain-based record fields from baked 3D scenes into activities.json:
//   altitude_max  — highest elevation reached along the drawn route, metres
//   climb_terrain — total ascent of the whole run from terrain, metres
// The sync job rebuilds activities.json from run_page/data.db, so these must
// also be pushed into the DB: run `python scripts/sync_scene_records_db.py`
// afterwards (the coros_sync workflow does that after the bake step).
//
// Usage: node scripts/backfill-scene-records.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeScene } from '../node_modules/@geekplux/vert/dist-lib/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const actPath = join(root, 'src/static/activities.json');
const scenesDir = join(root, 'public/scenes');

const activities = JSON.parse(readFileSync(actPath, 'utf8'));
const hashes = JSON.parse(
  readFileSync(join(root, 'src/static/scenes.json'), 'utf8')
);

let updated = 0;
let missing = 0;

for (const a of activities) {
  const id = String(a.run_id);
  const hash = hashes[id];
  if (!hash) {
    // no scene: drop stale backfill values so the field mirrors scene coverage
    if (a.altitude_max !== undefined || a.climb_terrain !== undefined) {
      delete a.altitude_max;
      delete a.climb_terrain;
      updated++;
    }
    missing++;
    continue;
  }
  const scenePath = join(scenesDir, `${id}.scene`);
  if (!existsSync(scenePath)) {
    console.warn(`sidecar without binary: ${id}`);
    missing++;
    continue;
  }
  let scene;
  try {
    scene = decodeScene(readFileSync(scenePath));
  } catch (e) {
    console.warn(`decode failed for ${id}: ${e.message}`);
    missing++;
    continue;
  }
  const elev = scene.route.elevation;
  if (elev.length) {
    a.altitude_max = Math.round(Math.max(...elev) * 10) / 10;
  }
  const climb = scene.summary.climb;
  if (typeof climb === 'number' && Number.isFinite(climb)) {
    a.climb_terrain = Math.round(climb * 10) / 10;
  }
  updated++;
}

writeFileSync(actPath, JSON.stringify(activities));
console.log(
  `done: updated ${updated} of ${activities.length} activities, ` +
    `no-scene/failed ${missing}`
);
