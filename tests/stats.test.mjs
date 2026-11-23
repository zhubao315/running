import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

// 复用 build-data-shards.mjs 的加载方式：Vite SSR loader 解析 @/ 别名与 TS，
// 与页面使用同一个统计引擎，不另起一套口径。
const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let stats;
try {
  stats = await server.ssrLoadModule('/src/utils/runningStats.ts');
} finally {
  await server.close();
}

const {
  buildDataset,
  computeTotals,
  availableYears,
  daysInMonth,
  firstWeekdayOffset,
  filterRunsByScope,
  formatPaceSeconds,
  formatDurationLong,
} = stats;

const act = (over = {}) => ({
  run_id: 1,
  name: 'test run',
  distance: 10000,
  moving_time: '0:50:00',
  type: 'run',
  subtype: 'run',
  start_date: '2024-03-01 08:00:00',
  start_date_local: '2024-03-01 08:00:00',
  average_speed: 10 / 3,
  streak: 1,
  ...over,
});

test('buildDataset 只收 run 类型，其他运动计入 dropped', () => {
  const ds = buildDataset([
    act({ run_id: 1, type: 'run' }),
    act({ run_id: 2, type: 'cycling' }),
    act({ run_id: 3, type: 'hiking' }),
  ]);
  assert.equal(ds.runs.length, 1);
  assert.equal(ds.dropped, 2);
  assert.equal(ds.runs[0].run_id, 1);
});

test('buildDataset 按 run_id 去重', () => {
  const ds = buildDataset([act({ run_id: 1 }), act({ run_id: 1 }), act({ run_id: 2 })]);
  assert.equal(ds.runs.length, 2);
  assert.equal(ds.dropped, 1);
});

test('无效距离 / 时长 / 日期被丢弃，不补零', () => {
  const ds = buildDataset([
    act({ run_id: 1, distance: 0 }),
    act({ run_id: 2, moving_time: '' }),
    act({ run_id: 3, start_date_local: 'not-a-date' }),
    act({ run_id: 4 }),
  ]);
  assert.equal(ds.runs.length, 1);
  assert.equal(ds.dropped, 3);
  assert.equal(ds.runs[0].run_id, 4);
});

test('computeTotals 配速为总时长 / 总距离，而非逐条平均', () => {
  const ds = buildDataset([
    act({ run_id: 1, distance: 5000, moving_time: '0:20:00' }),
    act({ run_id: 2, distance: 10000, moving_time: '1:00:00' }),
  ]);
  const t = computeTotals(ds.runs);
  assert.equal(t.count, 2);
  assert.equal(t.distanceKm, 15);
  assert.equal(t.seconds, 4800);
  assert.ok(Math.abs(t.paceSecondsPerKm - 320) < 1e-9);
});

test('缺失心率时 hrAverage 为 null 而非 0', () => {
  const t = computeTotals(buildDataset([act({ run_id: 1 })]).runs);
  assert.equal(t.hrCount, 0);
  assert.equal(t.hrAverage, null);
});

test('availableYears 升序去重（页面层再反转展示）', () => {
  const ds = buildDataset([
    act({ run_id: 1, start_date_local: '2023-01-01 08:00:00' }),
    act({ run_id: 2, start_date_local: '2024-01-01 08:00:00' }),
    act({ run_id: 3, start_date_local: '2024-06-01 08:00:00' }),
  ]);
  assert.deepEqual(availableYears(ds.runs), [2023, 2024]);
});

test('日历：闰年天数与周一优先偏移', () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2023, 2), 28);
  assert.equal(firstWeekdayOffset(2024, 3), 4); // 2024-03-01 周五，Mon=0
});

test('filterRunsByScope 按日期 / 年 / 月过滤', () => {
  const ds = buildDataset([
    act({ run_id: 1, start_date_local: '2024-03-01 08:00:00' }),
    act({ run_id: 2, start_date_local: '2024-04-01 08:00:00' }),
    act({ run_id: 3, start_date_local: '2023-04-01 08:00:00' }),
  ]);
  assert.equal(filterRunsByScope(ds.runs, { date: '2024-03-01' }).length, 1);
  assert.equal(filterRunsByScope(ds.runs, { year: 'all', month: null }).length, 3);
  assert.equal(filterRunsByScope(ds.runs, { year: 2024, month: 4 }).length, 1);
  assert.equal(filterRunsByScope(ds.runs, { year: 2023, month: null }).length, 1);
});

test('格式化函数对 null / 非法值返回 —', () => {
  assert.equal(formatPaceSeconds(null), '—');
  assert.equal(formatPaceSeconds(0), '—');
  assert.equal(formatDurationLong(null), '—');
  assert.equal(formatDurationLong(-1), '—');
  assert.equal(formatPaceSeconds(330), `5'30"`);
});
