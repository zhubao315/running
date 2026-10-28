// Bake Vert scenes for running_page activities (polylines only, elevation from terrain tiles).
//
//   node scripts/bake-scenes.mjs [--year 2026] [--limit 0] [--min-distance 0] [--force]
//                                [--concurrency 4] [--prune] [--out public/scenes]
//
// Skips runs that already have a scene unless --force. Writes src/static/scenes.json
// (run_id -> sidecar hash) which is what the page reads.
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const year = arg('--year', '');
const since = arg('--since', '');
const limit = Number(arg('--limit', '0'));
const minDistance = Number(arg('--min-distance', '0'));
const concurrency = Math.max(1, Number(arg('--concurrency', '4')));
const force = args.includes('--force');
const prune = args.includes('--prune');
const outDir = resolve(root, arg('--out', 'public/scenes'));
const cacheDir = process.env.VERT_TILE_CACHE || '/tmp/vert-bake-cache';
const bake =
  process.env.VERT_BAKE ||
  join(root, 'node_modules/@geekplux/vert/dist-lib/bake.js');

const activities = JSON.parse(
  readFileSync(join(root, 'src/static/activities.json'), 'utf8')
);

/** Google encoded polyline (precision 5) -> [{lat, lon}] */
function decodePolyline(str) {
  const points = [];
  let i = 0,
    lat = 0,
    lon = 0;
  while (i < str.length) {
    for (let k = 0; k < 2; k++) {
      let shift = 0,
        result = 0,
        b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += delta;
      else lon += delta;
    }
    points.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return points;
}

const scenePath = (id) => join(outDir, `${id}.scene`);
const sidecarPath = (id) => join(outDir, `${id}.scene.json`);
const hashOf = (id) => {
  try {
    return JSON.parse(readFileSync(sidecarPath(id), 'utf8')).hash;
  } catch {
    return undefined;
  }
};

mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const ids = new Set(activities.map((a) => String(a.run_id)));
const hashes = {};
for (const id of ids) {
  if (!existsSync(scenePath(id)) || !existsSync(sidecarPath(id))) continue;
  const hash = hashOf(id);
  if (hash) hashes[id] = hash;
}

let runs = activities.filter((a) => a.summary_polyline && a.distance >= minDistance);
if (year) runs = runs.filter((a) => a.start_date_local.startsWith(year));
if (since) runs = runs.filter((a) => a.start_date_local.slice(0, 10) >= since);
runs.sort((a, b) => (a.start_date_local < b.start_date_local ? 1 : -1));
if (limit > 0) runs = runs.slice(0, limit);

const queue = runs.filter((run) => force || !hashes[String(run.run_id)]);

if (force) {
  for (const run of runs) delete hashes[String(run.run_id)];
}

/** Bake one run, retrying short ones with a 50 m trim instead of 200 m. */
async function bakeOne(run) {
  const id = String(run.run_id);
  const points = decodePolyline(run.summary_polyline);
  if (points.length < 2) return { id, ok: false, err: 'no points' };

  const bakeOnce = (trim) =>
    new Promise((res) => {
      const bakeArgs = [
        bake,
        '-',
        '--id',
        id,
        '--out',
        outDir,
        '--cache',
        cacheDir,
      ];
      if (trim !== undefined) bakeArgs.push('--trim', String(trim));
      const child = spawn(process.execPath, bakeArgs, {
        stdio: ['pipe', 'ignore', 'pipe'],
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });
      let err = '';
      child.stderr.on('data', (d) => {
        err += d;
      });
      child.on('error', () => res({ code: 1, err }));
      child.on('close', (code) => res({ code, err }));
      child.stdin.end(JSON.stringify({ points }));
    });

  let { code, err } = await bakeOnce();
  if (code !== 0 && /too short to trim/.test(err)) {
    ({ code, err } = await bakeOnce(50));
  }
  return { id, ok: code === 0, err };
}

let done = 0;
let failed = 0;
let next = 0;
const started = Date.now();

async function worker() {
  while (next < queue.length) {
    const run = queue[next++];
    const { id, ok, err } = await bakeOne(run);
    if (ok) {
      const hash = hashOf(id);
      if (hash) {
        hashes[id] = hash;
        done++;
      } else {
        failed++;
      }
    } else {
      failed++;
      console.error(
        `fail ${id}: ${(err || '').trim().split('\n').slice(-2).join(' | ')}`
      );
    }
    if ((done + failed) % 20 === 0) {
      const rate = (done + failed) / ((Date.now() - started) / 1000);
      console.log(
        `progress ${done + failed}/${queue.length} (${done} ok, ${failed} failed, ${rate.toFixed(1)}/s)`
      );
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

if (prune) {
  const keep = ids;
  let removed = 0;
  for (const file of readdirSync(outDir)) {
    if (!/\.scene(\.json)?$/.test(file)) continue;
    const id = file.replace(/\.scene(\.json)?$/, '');
    if (keep.has(id)) continue;
    rmSync(join(outDir, file));
    removed++;
  }
  if (removed) console.log(`pruned ${removed} orphan scene files`);
}

const sorted = Object.fromEntries(Object.keys(hashes).sort().map((k) => [k, hashes[k]]));
writeFileSync(
  join(root, 'src/static/scenes.json'),
  JSON.stringify(sorted, null, 2) + '\n'
);
console.log(
  `done ${done}, failed ${failed}, scenes ${Object.keys(sorted).length}`
);
