#!/usr/bin/env node
/**
 * Verify the built data shards in dist/data (post-build gate).
 * Canonical copy: active-watch/tools/verify-shards.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const SITE =
  process.env.SHARD_SITE ||
  process.env.SITE_SPORT ||
  path.basename(ROOT).replace(/^zb-/, '');
if (!['running', 'cycling', 'hiking'].includes(SITE)) {
  console.error('SHARD_SITE (or SITE_SPORT) must be running | cycling | hiking');
  process.exit(2);
}

const DATA = path.join(ROOT, 'dist/data');
const failures = [];
const read = (file) => {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) {
    failures.push(`missing ${file}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    failures.push(`${file} is not valid JSON (${e.message})`);
    return null;
  }
};

const manifest = read('data-manifest.json');
const career = read('career-summary.json');
const yearly = read('yearly-summary.json');

if (manifest) {
  if (manifest.schema_version !== 1) failures.push('manifest schema_version != 1');
  if (manifest.site !== SITE) failures.push(`manifest site ${manifest.site} != ${SITE}`);
  if (manifest.reconciled !== true) failures.push('manifest.reconciled is not true');
  const source = fs.readFileSync(path.join(ROOT, 'src/static/activities.json'));
  const sourceChecksum =
    'sha256:' + createHash('sha256').update(source).digest('hex');
  if (manifest.source_checksum !== sourceChecksum) {
    failures.push('source_checksum does not match activities.json');
  }
}

const checksum = (value) =>
  'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

if (manifest && career && yearly) {
  for (const [scope, meta] of Object.entries(manifest.scopes)) {
    const c = career.scopes?.[scope];
    const y = yearly.scopes?.[scope];
    if (!c || !y) {
      failures.push(`${scope}: missing from career/yearly summary`);
      continue;
    }
    if (c.activity_count !== meta.activity_count) {
      failures.push(`${scope}: career count ${c.activity_count} != manifest ${meta.activity_count}`);
    }
    const shardCount = meta.shards.reduce((n, s) => n + s.count, 0);
    if (shardCount !== meta.activity_count) {
      failures.push(`${scope}: shard records ${shardCount} != ${meta.activity_count}`);
    }
    for (const shard of meta.shards) {
      const file = `yearly-activities/${scope}/${shard.year}.json`;
      const records = read(file);
      if (!records) continue;
      if (records.length !== shard.count) {
        failures.push(`${file}: ${records.length} records != ${shard.count}`);
      }
      if (checksum(records) !== shard.checksum) {
        failures.push(`${file}: checksum mismatch`);
      }
      if (!y[shard.year]) failures.push(`${scope}: yearly-summary missing ${shard.year}`);
    }
  }
}

if (failures.length) {
  console.error('verify-shards: FAILED');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
const scopes = manifest ? Object.keys(manifest.scopes).join(', ') : '-';
console.log(`verify-shards: OK (site ${SITE}, scopes ${scopes}, reconciled)`);
