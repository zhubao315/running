// Bake missing 3D scenes and backfill elevation_gain from terrain
// Usage: node scripts/bake-elevation.mjs [--elevation-only] [--year 2024]
//        [--min-distance 0] [--concurrency 3] [--limit 0]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const elevationOnly = args.includes('--elevation-only');
const year = arg('--year', '');
const minDistance = Number(arg('--min-distance', '0'));
const concurrency = Math.max(1, Number(arg('--concurrency', '3')));
const limit = Number(arg('--limit', '0'));

const actPath = join(root, 'src/static/activities.json');
const scenesPath = join(root, 'src/static/scenes.json');
const outDir = join(root, 'public/scenes');
const cacheDir = process.env.VERT_TILE_CACHE || '/tmp/vert-bake-cache';
const bake = join(root, 'node_modules/@geekplux/vert/dist-lib/bake.js');

const activities = JSON.parse(readFileSync(actPath, 'utf8'));
let hashes = existsSync(scenesPath) ? JSON.parse(readFileSync(scenesPath, 'utf8')) : {};
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

function decode(str) {
  const p = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (let k = 0; k < 2; k++) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += delta; else lon += delta;
    }
    p.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return p;
}

let todo = activities.filter((a) => a.summary_polyline && a.distance >= minDistance);
if (year) todo = todo.filter((a) => a.start_date_local.startsWith(year));
if (!elevationOnly) todo = todo.filter((a) => !hashes[String(a.run_id)]);
if (limit > 0) todo = todo.slice(0, limit);
console.log(`targets: ${todo.length} (concurrency ${concurrency}${elevationOnly ? ', elevation only' : ''})`);

let elevationUpdated = 0, baked = 0, failed = 0, processed = 0;

function readClimb(id) {
  const sidecar = join(outDir, `${id}.scene.json`);
  if (!existsSync(sidecar)) return null;
  try {
    const s = JSON.parse(readFileSync(sidecar, 'utf8'));
    hashes[String(id)] = s.hash;
    return typeof s.summary?.climb === 'number' ? s.summary.climb : null;
  } catch { return null; }
}

async function work(a) {
  const id = String(a.run_id);
  let climb = readClimb(id);
  if (!elevationOnly && climb === null) {
    const points = decode(a.summary_polyline);
    if (points.length >= 2) {
      const bakeOnce = (trim) => new Promise((res) => {
        const argv = [bake, '-', '--id', id, '--out', outDir, '--cache', cacheDir];
        if (trim !== null) argv.push('--trim', String(trim));
        const child = spawn(process.execPath, argv, {
          stdio: ['pipe', 'ignore', 'ignore'],
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
        });
        child.on('error', () => res(1));
        child.on('close', res);
        child.stdin.end(JSON.stringify({ points }));
      });
      // short tracks fail the privacy check at the default 200 m trim; retry
      // with the full route (trim 0) before giving up
      let code = await bakeOnce(null);
      if (code !== 0) code = await bakeOnce(0);
      if (code === 0) { climb = readClimb(id); baked++; }
      else failed++;
    }
  }
  if (climb !== null && climb > 0 && (!a.elevation_gain || a.elevation_gain === 0)) {
    a.elevation_gain = climb;
    elevationUpdated++;
  }
  processed++;
  if (processed % 50 === 0) console.log(`progress ${processed}/${todo.length} | baked ${baked} | elev ${elevationUpdated} | failed ${failed}`);
}

const queue = [...todo];
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (queue.length) await work(queue.shift());
}));

writeFileSync(actPath, JSON.stringify(activities));
const sorted = Object.fromEntries(Object.keys(hashes).sort().map((k) => [k, hashes[k]]));
writeFileSync(scenesPath, JSON.stringify(sorted, null, 2) + '\n');
console.log(`done: processed ${processed}, baked ${baked}, elevation filled ${elevationUpdated}, failed ${failed}, scenes ${Object.keys(sorted).length}`);
