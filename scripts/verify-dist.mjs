#!/usr/bin/env node
// Verify the built site before it is published.
//
// The deploy job runs this right after `pnpm build` and before the artifact is
// uploaded, so a build that is broken in a way only the browser would notice
// (a missing chunk, a data set that still holds records another site owns,
// a caption copied from the wrong sport) never reaches GitHub Pages.
//
// Usage: node scripts/verify-dist.mjs [dist-dir]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(process.argv[2] || path.join(root, 'dist'));

const problems = [];
const notes = [];

const fail = (message) => problems.push(message);
const note = (message) => notes.push(message);

// ---------------------------------------------------------------- structure

if (!existsSync(dist)) {
  console.error(
    `verify-dist: ${dist} does not exist — the build produced nothing`
  );
  process.exit(1);
}

const indexPath = path.join(dist, 'index.html');
if (!existsSync(indexPath)) {
  console.error('verify-dist: dist/index.html is missing');
  process.exit(1);
}
const index = readFileSync(indexPath, 'utf-8');

if (!/<div id="root"|<div id="app"|<main/i.test(index)) {
  fail('dist/index.html has no mount point — the SPA shell did not render');
}

// Every asset the shell asks for has to exist in the build.
//
// The page is published under a path prefix ("/running/", "/cycling/", …),
// so the URLs in index.html carry that prefix while the files in dist/ do
// not. The prefix is taken from the assets themselves rather than guessed.
const hrefs = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const localHrefs = hrefs.filter(
  (href) =>
    !/^(https?:)?\/\//.test(href) &&
    !href.startsWith('data:') &&
    !href.startsWith('#') &&
    /\.[a-z0-9]+$/i.test(href.split('?')[0])
);
const prefix = localHrefs.length
  ? localHrefs
      .map((href) => href.split('?')[0].split('/'))
      .reduce((acc, parts) => {
        const out = [];
        for (let i = 0; i < acc.length && i < parts.length; i += 1) {
          if (acc[i] !== parts[i]) break;
          out.push(acc[i]);
        }
        return out;
      })
      .join('/')
  : '';
let missingAssets = 0;
for (const href of localHrefs) {
  const relative = href.split('?')[0].slice(prefix.length).replace(/^\//, '');
  const file = path.join(dist, relative);
  if (!existsSync(file)) {
    missingAssets += 1;
    fail(`dist is missing an asset the page asks for: ${href}`);
  }
}
note(
  `index.html references ${localHrefs.length} local asset(s)` +
    (prefix ? ` under ${prefix}` : '')
);

const assetDir = path.join(dist, 'assets');
if (!existsSync(assetDir)) {
  fail('dist/assets is missing — the build produced no bundles');
} else {
  const bundles = readdirSync(assetDir).filter((f) => f.endsWith('.js'));
  if (bundles.length === 0) fail('dist/assets holds no JavaScript bundle');
  note(`${bundles.length} bundle(s) in dist/assets`);
}

// --------------------------------------------------------------- content

// The text of every bundle, so a caption that survived a copy/paste from
// another site is caught here and not by a reader.
let bundleText = '';
if (existsSync(assetDir)) {
  for (const file of readdirSync(assetDir)) {
    if (!file.endsWith('.js')) continue;
    bundleText += readFileSync(path.join(assetDir, file), 'utf-8');
  }
}

// Each site says things in its own words. The riding site once shipped the
// running site's sentences and the hiking site the old running template, so
// the wording itself is a regression test: the right sentences have to be
// there, and the other sports' have not.
const SITE = process.env.SITE_SPORT || 'running';
const SPORT_CN = { running: '跑步', cycling: '骑行', hiking: '徒步' };
const OTHERS = ['running', 'cycling', 'hiking'].filter((s) => s !== SITE);

const FORBIDDEN = [
  ...OTHERS.flatMap((sport) => [
    {
      text: `本页只统计${SPORT_CN[sport]}记录`,
      why: `${sport} copy left in the ${SITE} site`,
    },
    {
      text: `标记的${SPORT_CN[sport]}可查看地形`,
      why: `${sport} copy left in the ${SITE} site`,
    },
  ]),
  // the old running template: the hiking site showed "时段节律 0 Runs"
  { text: '时段节律', why: 'the old running template left in the site' },
  { text: '0 Runs', why: 'the old running template left in the site' },
];
for (const rule of FORBIDDEN) {
  if (bundleText.includes(rule.text)) {
    fail(`bundle still contains "${rule.text}" (${rule.why})`);
  }
}

// The site's own sentences have to be there: a site that lost its own wording
// would render a panel nobody can read.
const EXPECTED = {
  running: [
    {
      text: '本页只统计跑步记录',
      why: 'the running site names its own records',
    },
    { text: '跑步节律', why: 'the running site has its rhythm panel' },
  ],
  cycling: [
    {
      text: '本页只统计骑行记录',
      why: 'the riding site names its own records',
    },
    { text: '平均速度', why: 'the riding site shows a speed, not a pace' },
  ],
  hiking: [
    {
      text: '本页只统计徒步记录',
      why: 'the hiking site names its own records',
    },
    {
      text: '标记的徒步可查看地形剖面',
      why: 'the hiking site names its terrain',
    },
  ],
};
for (const rule of EXPECTED[SITE] || []) {
  if (!bundleText.includes(rule.text)) {
    fail(`the bundle is missing "${rule.text}" (${rule.why})`);
  }
}

// --------------------------------------------------------------- per site

const activitiesPath = path.join(root, 'src', 'static', 'activities.json');
const readActivities = () =>
  existsSync(activitiesPath)
    ? JSON.parse(readFileSync(activitiesPath, 'utf-8'))
    : null;

const activities = readActivities();
if (activities) {
  note(`activities.json holds ${activities.length} record(s)`);

  // The running site must not publish the hikes it counted twice: the hiking
  // site owns those records.
  const duplicatesPath = path.join(root, 'run_page', 'hiking_duplicates.json');
  if (existsSync(duplicatesPath)) {
    const duplicates = JSON.parse(readFileSync(duplicatesPath, 'utf-8'));
    const entries = Array.isArray(duplicates.entries) ? duplicates.entries : [];
    const published = new Set(activities.map((a) => String(a.run_id)));
    const leaked = entries.filter((entry) =>
      published.has(String(entry.run_id))
    );
    if (leaked.length) {
      fail(
        `${leaked.length} hiking duplicate(s) are published again: ` +
          leaked.map((e) => e.run_id).join(', ')
      );
    } else {
      note(`no hiking duplicate among the ${entries.length} known ones`);
    }
  }

  // The geometry must not be in the eager bundle any more.
  const polylineBytes = activities.reduce(
    (sum, a) =>
      sum +
      (typeof a.summary_polyline === 'string' ? a.summary_polyline.length : 0),
    0
  );
  if (polylineBytes > 0 && bundleText.includes('summary_polyline')) {
    note(
      'the source still carries summary_polyline; the split plugin strips it ' +
        'at build time'
    );
  }
}

// The per-year track files are the geometry's home; without them the map
// would draw nothing.
const tracksDir = path.join(dist, 'data', 'tracks');
if (existsSync(tracksDir)) {
  const files = readdirSync(tracksDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    fail('dist/data/tracks holds no per-year track file');
  } else {
    const total = files.reduce(
      (sum, f) => sum + statSync(path.join(tracksDir, f)).size,
      0
    );
    note(`${files.length} track file(s), ${(total / 1048576).toFixed(1)} MB`);
  }
}

// ----------------------------------------------------------------- report

notes.forEach((n) => console.log(`verify-dist: ${n}`));
if (problems.length) {
  console.error('verify-dist: FAILED');
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log('verify-dist: OK');
