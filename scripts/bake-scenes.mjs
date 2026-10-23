// Bake Vert scenes for running_page activities (polylines only, elevation from terrain tiles).
// Usage: node scripts/bake-scenes.mjs [--year 2024] [--limit 0] [--min-distance 0] [--force] [--out public/scenes]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const year = arg('--year', '');
const limit = Number(arg('--limit', '0'));
const minDistance = Number(arg('--min-distance', '0'));
const force = args.includes('--force');
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

let runs = activities.filter(
  (a) => a.summary_polyline && a.distance >= minDistance
);
if (year) runs = runs.filter((a) => a.start_date_local.startsWith(year));
runs.sort((a, b) => (a.start_date_local < b.start_date_local ? 1 : -1));
if (limit > 0) runs = runs.slice(0, limit);

mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const hashes = {};

let done = 0,
  failed = 0;
for (const run of runs) {
  const id = String(run.run_id);
  const scene = join(outDir, `${id}.scene`);
  const sidecar = join(outDir, `${id}.scene.json`);
  if (!force && existsSync(scene) && existsSync(sidecar)) {
    try {
      hashes[id] = JSON.parse(readFileSync(sidecar, 'utf8')).hash;
    } catch {
      /* re-bake below */
    }
    if (hashes[id]) {
      done++;
      continue;
    }
  }
  const points = decodePolyline(run.summary_polyline);
  if (points.length < 2) {
    failed++;
    console.error(`skip ${id}: no points`);
    continue;
  }
  const code = await new Promise((res) => {
    const child = spawn(
      process.execPath,
      [bake, '-', '--id', id, '--out', outDir, '--cache', cacheDir],
      {
        stdio: ['pipe', 'ignore', 'pipe'],
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    let err = '';
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('error', () => res(1));
    child.on('close', (c) => {
      if (c !== 0)
        console.error(
          `fail ${id}: ${err.trim().split('\n').slice(-2).join(' | ')}`
        );
      res(c);
    });
    child.stdin.end(JSON.stringify({ points }));
  });
  if (code === 0) {
    try {
      hashes[id] = JSON.parse(readFileSync(sidecar, 'utf8')).hash;
      done++;
    } catch {
      failed++;
    }
  } else failed++;
  if ((done + failed) % 20 === 0)
    console.log(
      `progress ${done + failed}/${runs.length} (${done} ok, ${failed} failed)`
    );
}

// keep hashes of pre-existing scenes too
for (const run of activities) {
  const id = String(run.run_id);
  if (hashes[id]) continue;
  const sidecar = join(outDir, `${id}.scene.json`);
  if (existsSync(sidecar)) {
    try {
      hashes[id] = JSON.parse(readFileSync(sidecar, 'utf8')).hash;
    } catch {
      /* ignore */
    }
  }
}
const sorted = Object.fromEntries(
  Object.keys(hashes)
    .sort()
    .map((k) => [k, hashes[k]])
);
writeFileSync(
  join(root, 'src/static/scenes.json'),
  JSON.stringify(sorted, null, 2) + '\n'
);
console.log(
  `done ${done}, failed ${failed}, scenes ${Object.keys(sorted).length}`
);
