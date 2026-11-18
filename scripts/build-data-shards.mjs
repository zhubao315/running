#!/usr/bin/env node
/**
 * Build-time data sharding for a sport site.
 *
 * The existing stats module (src/utils/<site>Stats.ts) is the ONLY computation
 * engine: it is loaded through Vite's SSR module loader so aliases and TS are
 * resolved exactly as in the app. This script never reimplements a statistic.
 *
 * Outputs (under public/data/, copied verbatim into dist/data/ by Vite):
 *   career-summary.json    small first-screen payload
 *   yearly-summary.json    per-year totals
 *   yearly-activities/<scope>/<year>.json   on-demand detail shards
 *   data-manifest.json     checksums + reconciliation proof
 *
 * Reconciliation gate: totals computed from the full dataset and totals
 * recomputed from the written shards must be byte-identical after a stable
 * sort. A mismatch fails the build instead of shipping divergent numbers.
 *
 * Usage: SITE_SPORT=running node scripts/build-data-shards.mjs
 * Canonical copy: active-watch/tools/build-data-shards.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const ROOT = process.cwd();
const SITE =
  process.env.SHARD_SITE ||
  process.env.SITE_SPORT ||
  path.basename(ROOT).replace(/^zb-/, '');
if (!['running', 'cycling', 'hiking'].includes(SITE)) {
  console.error('SHARD_SITE (or SITE_SPORT) must be running | cycling | hiking');
  process.exit(2);
}

const sourcePath = path.join(ROOT, 'src/static/activities.json');
const bytes = fs.readFileSync(sourcePath);
const activities = JSON.parse(bytes.toString('utf8'));
if (!Array.isArray(activities) || activities.length === 0) {
  console.error('activities.json is empty or not an array');
  process.exit(1);
}
const sourceChecksum = 'sha256:' + createHash('sha256').update(bytes).digest('hex');

// Vite loads the same TS module the dashboard uses, with the same aliases.
const server = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let stats;
try {
  stats = await server.ssrLoadModule(`/src/utils/${SITE}Stats.ts`);
} finally {
  await server.close();
}
for (const name of ['buildDataset', 'computeTotals', 'buildYearSeries']) {
  if (typeof stats[name] !== 'function') {
    console.error(`stats engine ${SITE}Stats.ts is missing ${name}`);
    process.exit(1);
  }
}

const MIN_DISTANCE_M = 3000;
const scopes =
  SITE === 'cycling'
    ? [
        { key: 'standard', select: (a) => (a.distance || 0) >= MIN_DISTANCE_M },
        { key: 'all', select: () => true },
      ]
    : [{ key: 'all', select: () => true }];

const OUT = path.join(ROOT, 'public/data');
const SHARD_ROOT = path.join(OUT, 'yearly-activities');
fs.mkdirSync(SHARD_ROOT, { recursive: true });

const sha256 = (value) =>
  'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const byId = (a, b) => Number(a.run_id) - Number(b.run_id);
const yearOf = (a) => String(a.start_date_local || '').slice(0, 4);

const career = { schema_version: 1, site: SITE, source_checksum: sourceChecksum, scopes: {} };
const yearly = { schema_version: 1, site: SITE, scopes: {} };
const manifest = {
  schema_version: 1,
  site: SITE,
  generated_at: new Date().toISOString(),
  source_checksum: sourceChecksum,
  source_count: activities.length,
  stats_engine: `src/utils/${SITE}Stats.ts`,
  scopes: {},
  reconciled: false,
};

for (const scope of scopes) {
  const scoped = activities.filter(scope.select);
  const { runs, dropped } = stats.buildDataset(scoped);
  const totals = stats.computeTotals(runs);
  const yearSeries = stats.buildYearSeries(runs);
  const years = yearSeries.map((p) => String(p.year)).sort().reverse();

  // Group the RAW activity objects (already polyline-free in the meta module)
  // by calendar year. Detail shards carry records, never re-derived numbers.
  const buckets = new Map();
  for (const a of scoped) {
    const year = yearOf(a);
    if (!/^\d{4}$/.test(year)) continue;
    if (!buckets.has(year)) buckets.set(year, []);
    buckets.get(year).push(a);
  }

  const scopeDir = path.join(SHARD_ROOT, scope.key);
  fs.mkdirSync(scopeDir, { recursive: true });
  const shardList = [];
  for (const year of years) {
    // Mirror splitActivities: keep metadata only, never ship GPS inside the
    // detail shards. Tracks stay in the existing on-demand per-year files.
    const records = (buckets.get(year) || []).map((a) => {
      const { summary_polyline, ...meta } = a;
      return summary_polyline ? { ...meta, has_track: true } : meta;
    });
    fs.writeFileSync(path.join(scopeDir, `${year}.json`), JSON.stringify(records));
    shardList.push({ year, count: records.length, checksum: sha256(records) });
  }

  // ---- reconciliation: shards must reproduce the original statistics ----
  const shardRecords = shardList.flatMap((s) =>
    JSON.parse(fs.readFileSync(path.join(scopeDir, `${s.year}.json`), 'utf8'))
  );
  const fromShards = stats.computeTotals(
    [...stats.buildDataset(shardRecords).runs].sort(byId)
  );
  const full = stats.computeTotals([...runs].sort(byId));
  const same = JSON.stringify(full) === JSON.stringify(fromShards);
  if (!same) {
    console.error(`RECONCILIATION FAILED for ${SITE}/${scope.key}`);
    console.error('full   :', JSON.stringify(full));
    console.error('shards :', JSON.stringify(fromShards));
    process.exit(1);
  }

  const shardTotal = shardList.reduce((n, s) => n + s.count, 0);
  career.scopes[scope.key] = {
    totals,
    dropped,
    years,
    activity_count: scoped.length,
    shard_count: shardTotal,
    last_activity_date: totals.lastDate,
    min_distance_m: scope.key === 'standard' ? MIN_DISTANCE_M : 0,
  };
  yearly.scopes[scope.key] = Object.fromEntries(
    yearSeries.map((p) => [String(p.year), p])
  );
  manifest.scopes[scope.key] = {
    activity_count: scoped.length,
    shard_count: shardTotal,
    years,
    shards: shardList,
    totals,
    reconciliation: { identical: true, engine: `src/utils/${SITE}Stats.ts` },
  };
  console.log(
    `[shards] ${SITE}/${scope.key}: ${scoped.length} activities, ${years.length} years, reconciled ✓`
  );
}

manifest.reconciled = Object.values(manifest.scopes).every(
  (s) => s.reconciliation.identical
);
fs.writeFileSync(path.join(OUT, 'career-summary.json'), JSON.stringify(career, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'yearly-summary.json'), JSON.stringify(yearly, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'data-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`[shards] wrote ${OUT}`);
