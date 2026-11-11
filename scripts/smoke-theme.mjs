#!/usr/bin/env node
// Smoke test for the built page: the shared navigation and the shared theme.
//
// The four sites share one navigation and one theme key, so a change to the
// header or to the theme tokens can break all four at once. This test opens
// the built page in a real browser and checks the things that must hold:
//
//   - the navigation carries the Chinese labels and the English site names,
//     and exactly one of them is the current site;
//   - the page starts in the dark theme;
//   - the theme button switches the page, and the choice is written to the
//     shared localStorage key;
//   - the choice survives a reload;
//   - the map and the page are still there after the switch.
//
// Usage: BROWSER_PATH=<chromium> node scripts/smoke-theme.mjs [dist-dir]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// playwright-core is not a dependency of the page: it is installed by the
// deploy job, outside the project, and found through NODE_PATH.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(process.argv[2] || path.join(root, 'dist'));
const port = Number(process.env.SMOKE_PORT || 0);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.scene': 'application/octet-stream',
};

const problems = [];
const expect = (cond, msg) => {
  if (!cond) problems.push(msg);
};

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error(`smoke-theme: ${dist}/index.html is missing — build first`);
  process.exit(1);
}

// The deploy builds with a path prefix ("/running"), so the built page asks
// for its assets under that prefix. The test server serves the build the
// same way, or the page would load without a script.
const builtHtml = readFileSync(path.join(dist, 'index.html'), 'utf-8');
const assetHref = [
  ...builtHtml.matchAll(/(?:src|href)="(\/[^"]+\/assets\/[^"]+)"/g),
].map((match) => match[1])[0];
const basePath = assetHref
  ? assetHref.slice(0, assetHref.indexOf('/assets/'))
  : '';

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || '/';
  }
  let file = path.join(dist, pathname);
  if (existsSync(file) && statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!existsSync(file)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader(
    'Content-Type',
    MIME[path.extname(file)] || 'application/octet-stream'
  );
  res.end(readFileSync(file));
});

// Port 0 asks the OS for a free port, so a busy machine never breaks the
// test.
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
const actualPort = server.address().port;

const browser = await chromium.launch({
  ...(process.env.BROWSER_PATH
    ? { executablePath: process.env.BROWSER_PATH }
    : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 1360, height: 900 },
});
const page = await context.newPage();
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error')
    problems.push(`console.error: ${message.text()}`);
});

const base = `http://127.0.0.1:${actualPort}${basePath}/`;
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

console.log('smoke-theme: page loaded');

// --- the shared navigation -------------------------------------------------
const nav = await page.evaluate(() => {
  const items = [...document.querySelectorAll('nav a[data-site]')];
  return {
    sites: items.map((a) => a.dataset.site),
    zh: items.map((a) => a.firstElementChild?.textContent?.trim() || ''),
    en: items.map((a) => a.lastElementChild?.textContent?.trim() || ''),
    current: document.querySelectorAll('nav a[aria-current="page"]').length,
  };
});
expect(
  ['健康', '跑步', '骑行', '徒步'].every((zh) => nav.zh.includes(zh)),
  `the navigation carries the Chinese labels (${nav.zh.join(',')})`
);
expect(
  ['HEALTH', 'RUNNING', 'CYCLING', 'HIKING'].every((en) => nav.en.includes(en)),
  `the navigation carries the English site names (${nav.en.join(',')})`
);
expect(
  nav.current === 1,
  `exactly one navigation item is current (${nav.current})`
);
console.log(
  `smoke-theme: navigation = ${nav.zh.join('/')} (${nav.en.join('/')})`
);

// --- the theme --------------------------------------------------------------
const initial = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  bg: getComputedStyle(document.body).backgroundColor,
  hasMap: !!document.querySelector('.maplibregl-canvas'),
}));
expect(initial.theme === 'dark', `the page starts dark (${initial.theme})`);

const toggle = page.locator('[aria-label*="主题"]').first();
expect((await toggle.count()) === 1, 'the theme button is on the page');
await toggle.click();
await page.waitForTimeout(700);

const light = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  stored: localStorage.getItem('zhubao315-theme'),
  bg: getComputedStyle(document.body).backgroundColor,
  colorScheme: document.documentElement.style.colorScheme,
  hasMap: !!document.querySelector('.maplibregl-canvas'),
  sections: document.querySelectorAll('section[id]').length,
}));
expect(
  light.theme === 'light',
  `the button switches the theme (${light.theme})`
);
expect(light.stored === 'light', `the choice is stored (${light.stored})`);
expect(light.colorScheme === 'light', 'color-scheme follows the theme');
expect(light.bg !== initial.bg, 'the page background follows the theme');
expect(light.hasMap, 'the map is still there after the switch');
expect(light.sections > 0, 'the page still has its sections');

console.log('smoke-theme: theme switched');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const afterReload = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  bg: getComputedStyle(document.body).backgroundColor,
}));
expect(afterReload.theme === 'light', 'the theme survives a reload');
expect(afterReload.bg === light.bg, 'the theme is applied before the paint');

console.log('smoke-theme: reloaded');
await browser.close();
server.close();

if (problems.length) {
  console.error('smoke-theme: FAILED');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}
console.log('smoke-theme: OK');
