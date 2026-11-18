#!/usr/bin/env node
/**
 * Generate a machine-readable "data watermark" for a sport site.
 *
 * The watermark is the contract between a data producer (a sport repo's COROS
 * sync) and the consumer (active-watch patrol). It reports what the data
 * ACTUALLY contains — not the timestamp of the last code commit.
 *
 * This file is the canonical copy. The three sport repos keep a byte-identical
 * copy under scripts/write-data-watermark.mjs; keep both in sync.
 *
 * Usage (inside a sport repo, after sync has refreshed activities.json):
 *   WATERMARK_SITE=running node scripts/write-data-watermark.mjs
 *
 * Optional env: ACTIVITIES_PATH, OUTPUT_PATH, BUILD_VERSION,
 *   SOURCE_UPDATED_AT, GENERATED_AT
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SITE = process.env.WATERMARK_SITE;
if (!SITE) {
  console.error('WATERMARK_SITE is required (health | running | cycling | hiking)');
  process.exit(2);
}

const root = process.env.ACTIVE_REPO_ROOT || process.cwd();
const activitiesPath = path.resolve(
  root,
  process.env.ACTIVITIES_PATH || 'src/static/activities.json'
);
const outputPath = path.resolve(
  root,
  process.env.OUTPUT_PATH || 'public/data-watermark.json'
);
const sourceUpdatedAt =
  process.env.SOURCE_UPDATED_AT ||
  fs.statSync(activitiesPath).mtime.toISOString();

const buildVersion =
  process.env.BUILD_VERSION ||
  (() => {
    try {
      return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
    } catch {
      return 'unknown';
    }
  })();

const bytes = fs.readFileSync(activitiesPath);
const activities = JSON.parse(bytes.toString('utf8'));
if (!Array.isArray(activities) || activities.length === 0) {
  console.error('activities.json is empty or not an array — refusing to write a watermark');
  process.exit(1);
}

let latest = '';
for (const a of activities) {
  const d = String(a.start_date_local || '').slice(0, 10);
  if (d > latest) latest = d;
}
if (!latest) {
  console.error('no start_date_local found in activities.json');
  process.exit(1);
}

const watermark = {
  schema_version: 1,
  site: SITE,
  generated_at: process.env.GENERATED_AT || new Date().toISOString(),
  latest_activity_date: latest,
  activity_count: activities.length,
  source_updated_at: sourceUpdatedAt,
  data_checksum: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
  build_version: buildVersion,
  status: 'ok',
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(watermark, null, 2) + '\n');
console.log(`[watermark] ${SITE}: ${watermark.activity_count} activities through ${latest} -> ${outputPath}`);
