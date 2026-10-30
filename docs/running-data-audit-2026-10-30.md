# Running dashboard rebuild — data audit and delivery notes

Date: 2026-10-30  
Site: <https://zhubao315.github.io/running/>  
Repo: `zhubao315/running` (`master`)  
Scope: running records only; cycling, hiking and health data stay out of every
running total.

## 1. Data audit

### 1.1 Sources

| Source | Role | Result |
| --- | --- | --- |
| `src/static/activities.json` | Runtime data used by the page | 2,048 records, all `type: "Run"` |
| `run_page/data.db` | Audit source of truth | 2,048 `Run` rows |
| `src/static/activities.json` vs DB | Key/date/distance comparison | 0 missing IDs, 0 distance diffs, 0 date diffs |
| `docs/running-monthly-2013-2026.csv` | Monthly breakdown | 133 months with at least one run |

The runtime JSON is the source for every number on the page. The DB confirms
that the JSON is complete. No record was edited, deleted, resampled or
zero-filled for this rebuild.

### 1.2 Career totals

| Metric | Value |
| --- | --- |
| Runs | **2,048** |
| Distance | **24,753.67 km** (displayed as 24,753.7 km) |
| Moving time | **8,403,342 s = 2,334 h 16 m** |
| Weighted pace | **5.6581 min/km = 5'39"/km** |
| First run | **2015-10-06** |
| Latest run | **2026-10-30** (2026 is partial) |
| Active running days | **1,826** |
| Days with 2+ runs | **176** (maximum 4 runs in one day) |
| Longest streak | **15 days**, ending **2020-03-06** |
| Current streak | **1 day** (2026-10-30) |
| Average distance per run | **12.09 km** |
| Average moving time per run | **1 h 08 m** |

### 1.3 Year by year

`—` means there are no records for that year. It is not a measured zero.

| Year | Runs | km | Hours | Weighted pace | Active days | HR records / mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2015 | 59 | 526.9 | 56.4 | 6'25" | 40 | 0 / — |
| 2016 | 216 | 2,151.6 | 216.8 | 6'03" | 177 | 0 / — |
| 2017 | 243 | 2,521.6 | 224.2 | 5'20" | 190 | 0 / — |
| 2018 | 251 | 2,467.1 | 235.4 | 5'44" | 210 | 0 / — |
| 2019 | 205 | 2,278.5 | 195.1 | 5'08" | 188 | 0 / — |
| 2020 | 197 | 2,303.0 | 202.8 | 5'17" | 177 | 0 / — |
| 2021 | 162 | 2,077.1 | 188.3 | 5'26" | 160 | 0 / — |
| 2022 | 160 | 2,247.7 | 199.9 | 5'20" | 144 | 82 / 147 |
| 2023 | 138 | 2,051.7 | 185.6 | 5'26" | 132 | 137 / 144 |
| 2024 | 148 | 2,143.4 | 211.5 | 5'55" | 144 | 144 / 145 |
| 2025 | 148 | 2,173.6 | 223.2 | 6'10" | 145 | 145 / 152 |
| 2026 | 121 | 1,811.6 | 195.1 | 6'28" | 119 | 121 / 149 |

Notes:

- 2017 has one record with `average_heartrate = 0`. It is treated as missing,
  so the year shows 0 valid HR records rather than a 0 bpm average.
- The annual chart now spans 2015–2026 inclusive. The only 2013 record was
  deleted at the user's request, so 2013–2014 no longer appear.
- 2026 ends on 2026-10-30; it is not a full-year comparison.

### 1.4 Field completeness

| Field | Present | Missing | Handling |
| --- | ---: | ---: | --- |
| `run_id` | 2,048 | 0 | Primary key; 0 duplicates |
| `distance` | 2,048 | 0 | 0 zero-distance rows |
| `moving_time` | 2,048 | 0 | 0 zero-duration rows |
| Date | 2,048 | 0 | Invalid dates would be dropped, none found |
| `average_heartrate` | 629 valid (+1 zero) | 1,420 | Mean uses values `> 0`; missing shows `—` |
| `location_country` | 1,731 | 317 | Missing location is not guessed |
| `summary_polyline` | 1,829 | 219 | Runs without a polyline stay out of map lines |
| Elevation gain | 0 | 2,048 | No elevation column exists; climb is not shown |

Additional checks:

- 0 duplicate `run_id`s; 0 duplicate/near-duplicate activities found.
- 0 zero-distance and 0 zero-duration rows.
- 14 runs are longer than 4 hours and slower than 6 km/h
  (78.76 h, 250.4 km). These look like watches left running, but they are
  retained because the source cannot prove an error. Excluding them would
  change the career pace to 5'31"/km; the page keeps the unmodified 5'39"/km.
- Heart-rate coverage is 629 / 2,048 = **30.7%**, mean **147.29 bpm**.
  Valid HR starts in 2022. The mean describes that sample only and is not
  comparable with 2015–2021.

## 2. Metric definitions

| UI metric | Definition | Important detail |
| --- | --- | --- |
| 累计跑量 | `Σ distance / 1000` | Kilometres, independent of pace |
| 累计时间 | `Σ moving_time` | Moving time, not elapsed time |
| 平均配速 | `Σ seconds / Σ kilometres` | Weighted by distance; not the mean of per-run paces |
| 跑步次数 | Count of runs in scope | Also reports distinct running days |
| 心率均值 | Mean of `average_heartrate > 0` | Coverage is always shown next to it |
| Annual trend | Same four metrics grouped by year | Empty year is a gap, not a zero |
| Calendar colour | Daily total km: `<10`, `10–15`, `15–20`, `20–30`, `30+` | A dot marks a day with multiple runs |
| 生涯档案 | Journey/PB/city/time-of-day archive | Not part of the top core metrics |

Rules used everywhere:

1. Only records whose type is `Run` enter the dataset.
2. Records are de-duplicated by `run_id`; invalid rows are dropped, never
   repaired with a zero.
3. Missing values render as `—`; real zero counts render as `0`.
4. Scope changes recompute every linked surface from the same filtered array.
5. The map title, table, calendar, trend, core metrics and day detail all read
   the same `RunScope`.

## 3. Old vs new information architecture

### Before

```
SiteHero (all-activity total, climb fallback, year count, latest run)
JourneyStats
#explore
├─ sidebar: LocationStat / YearsStat (year buttons, city, type)
└─ map + terrain
   └─ RunTable (latest year by default) or SVGStat ("Total")
```

Problems:

- The landing state was the latest year, not the career; the “Total” view was
  hidden behind a year switch.
- Totals were repeated in `SiteHero`, `YearStat` and the map controls.
- There was no annual trend and no month/day calendar.
- `SiteHero` counted every activity and silently substituted “longest streak”
  when elevation was absent.
- Table and map shared a mutable `runs` array; selecting a row could move the
  table out of its filter context.
- The 53-week SVG heatmap had no month labels and no day drill-down.

### After

```
A  Profile                 identity, 2015—2026, 2,048 runs, 3 countries / 15 provinces / 28 cities
B  Core metrics            distance, moving time, weighted pace, run count (scope-aware)
C  Annual trend            2015–2026 bars/line for distance, count, time, pace
D  Running calendar        12 month blocks, daily km colour, day detail
E  Activity explorer       map + 3D terrain + sortable/paginated table
F  Career archive          JourneyStats (cities, time of day, PBs)
   Data notes              coverage, missing elevation, anomalous durations
```

The top four blocks are the default “career” answer. Every block below them is
a drill-down target, not an independent filter.

## 4. Components

### New

| File | Responsibility |
| --- | --- |
| `src/utils/runningStats.ts` | Single source of truth: dataset build, totals, year series, calendar, filtering, geo summary, formatting |
| `src/components/RunningDashboard/index.tsx` | Composition, scope breadcrumb, calendar/day detail wiring, data notes |
| `src/components/RunningDashboard/Profile.tsx` | Module A profile and career facts |
| `src/components/RunningDashboard/CoreMetrics.tsx` | Module B four scope-aware metrics |
| `src/components/RunningDashboard/YearTrend.tsx` | Module C metric switch and year hit targets |
| `src/components/RunningDashboard/TrendChart.tsx` | CSS/SVG bars, pace line and gaps; no chart library |
| `src/components/RunningDashboard/RunCalendar.tsx` | Module D 12-month calendar and year navigation |
| `src/components/RunningDashboard/DayDetail.tsx` | Selected-day run list and run selection |
| `src/components/RunningDashboard/SectionHeader.tsx` | Shared numbered section header |
| `src/components/RunningDashboard/style.module.css` | Layout, accents, chart/calendar styling, responsive rules |

### Changed

| File | Change |
| --- | --- |
| `src/pages/index.tsx` | Owns `selectedYear/Month/Date/Metric/Run`; derives `baseRuns` and `scopeRuns`; integrates map, terrain, table, JourneyStats; removed `SiteHero`, `LocationStat`, `YearsStat`, `SVGStat`, `RunMapButtons` |
| `src/hooks/useActivities.ts` | Module-level cache; aggregates `Run` records only |
| `src/components/RunTable/index.tsx` | Stable internal sort, 80-row desktop / 24-row mobile pagination, ID-based selection |
| `src/components/RunTable/RunRow.tsx` | Keyboard row selection, `—` for missing values, mobile column set |
| `src/components/RunMap/index.tsx` | Removed year buttons; filters empty polylines; optional dash array; responsive height |
| `src/utils/utils.ts` | Pace rounding fix, `scrollToMap` target, shared `Activity` type |

Removed components are no longer rendered. Their files remain in the repo only
where other code still references them; the page no longer mounts them.

## 5. Interaction model

State:

```ts
selectedYear: string;        // 'all' | 'YYYY'
selectedMonth: number | null;
selectedDate: string | null;
selectedMetric: 'distance' | 'count' | 'duration' | 'pace';
selectedRunId: number | null;
quickFilter: { kind: 'city' | 'title'; value: string } | null;
```

Data flow:

```
activities.json
  → buildDataset (dedupe, Run only, validate)
  → runs
  → baseRuns (quick filter, if any)
  → scopeRuns (year → month → date)
  → core metrics / trend / calendar / map / table / day detail
```

Interaction rules:

- Click a year bar → `selectedYear`, clear month/date/run/quick filter.
- Click a month header → `selectedYear` + `selectedMonth`.
- Click a day → year + month + date; clicking the same day again clears the
  date and returns to the month.
- Click a day-detail row or table row → `selectedRunId`; map shows that run;
  page scrolls to `#explore`; if a baked 3D scene exists, the terrain card is
  scrolled into view.
- Clicking the selected table row again deselects it.
- Breadcrumb `全部历史` / `YYYY 年` / `M 月` navigates back one level.
- `清除筛选 ×` resets year, month, date, run and quick filter.
- Quick filters (city / run type) narrow `baseRuns`, so the trend, calendar,
  core metrics, map and table all follow the selection; the breadcrumb shows
  `城市 · 东城区` or `类型 · …`.
- Metric buttons switch the annual chart only; they do not change the table.
- Table sorting is internal to the table and never mutates the source array.
- Mobile table keeps activity / km / date and paginates 24 rows at a time;
  desktop keeps all columns and 80 rows.

## 6. Responsive and visual checks

- Desktop 1440: trend, calendar, day detail, map, terrain and table verified.
- Mobile 390: 2×2 core cards, 2-column calendar, no page horizontal overflow
  (`scrollWidth 390 = clientWidth 390`).
- 320: table has no page overflow, no table overflow, 3 visible columns,
  24 rows.
- 360 / 390 / 768 / 1024: metric values do not wrap; layout has no page-level
  horizontal scroll.
- Accent stays fluorescent yellow-green; dark restrained surfaces; 1px borders;
  no heavy shadows; charts are custom CSS/SVG.
- Map height is responsive; empty polylines are excluded; invalid dash arrays
  were removed.

## 7. Verification results

### Data / type / build

| Check | Result |
| --- | --- |
| `node_modules/.bin/tsc --noEmit` | Pass |
| `PATH_PREFIX=/running pnpm build` | Pass, 8.43 s |
| Build output | `dist/index.html` plus hashed JS/CSS assets |
| Build warning | Only the existing chunk-size warning |
| Data consistency | 2,048 JSON = 2,048 DB; 0 ID/date/distance diffs |
| Zero/duplicate rows | 0 zero distance, 0 zero time, 0 duplicate IDs |

### Browser interactions (Playwright, desktop 1440)

| Scenario | Expected | Result |
| --- | --- | --- |
| Initial load | 24,753.7 km, 2,048 runs, all history | Pass |
| Year 2025 | 2,173.6 km, 148 runs, 6'10"/km, calendar follows | Pass |
| October 2025 | 215.6 km, 14 runs, 8'33"/km | Pass |
| 2025-10-05 | 23.89 km, day detail and map title | Pass |
| Select day run | Map title changes, scope stays on the day | Pass |
| Clear | Career totals and all-history scope restored | Pass |
| Pace view | Line + 12 active-year dots, no zero bars | Pass |
| Count view | 13 bars + 1 explicit empty-year marker | Pass |
| Table pagination | 80 / 2,048 → 160 / 2,048 | Pass |
| KM sort | 42.24 km marathon first | Pass |
| City filter 东城区 | Breadcrumb, core metrics and map title update | Pass |
| Clear after city filter | Career totals restored | Pass |
| Horizontal overflow | 1,440 = 1,440 | Pass |

### Browser interactions (mobile 390 / 320)

| Check | Result |
| --- | --- |
| Page horizontal overflow | None at 320 and 390 |
| Core metric grid | 2×2 |
| Calendar | 2 columns |
| Day selection + day detail | Pass |
| Table columns | 活动 / KM / Date; 24 rows initially |
| Table overflow | None at 320 (238 px container) and 390 (308 px) |
| Console errors | 0 |

### Console notes

The page has no application errors. Two non-fatal MapLibre warnings remain:

```
Expected value to be of type number, but found null instead.
```

They come from optional style values in MapLibre, not from page code, and do
not block map rendering or interactions. Headless Chromium also emits WebGL
“GPU stall due to ReadPixels” performance warnings when the terrain canvas is
captured; those are environment warnings, not page failures.

## 8. Build and deployment

Local build:

```bash
PATH_PREFIX=/running pnpm build
```

The Pages workflow (`.github/workflows/gh-pages.yml`) and the deploy job in
`.github/workflows/coros_sync.yml` both build with:

```bash
PATH_PREFIX=/${{ github.event.repository.name }} pnpm build
```

so the `/running/` base path is preserved.

Deployment:

- Pushed commit `e2b04b3` to `master` on 2026-10-30.
- CI run `41009877522`: `success`.
- COROS Sync run `41009877670`: `success`; jobs
  `Sync COROS data` and `Build and deploy page` both `success`.
- Live URL: <https://zhubao315.github.io/running/>.
- Live HTML serves the same hashed assets as the local build:
  `index-6203be4e.js` and `index-2296203e.css`.

## 9. Known limitations

1. Elevation gain is absent from every record and from the DB schema. The
   dashboard does not show cumulative climb; it says so in the data notes.
2. Heart rate is only 30.7% covered and effectively starts in 2022. No
   pre-2022 comparison is implied.
3. 2026 is partial (through 2026-10-30).
4. 14 long/slow records are retained as recorded. They affect total time and
   pace; the page documents them instead of silently deleting them.
5. 317 records have no location and 219 have no polyline. They still count
   toward totals; they simply do not appear as map lines or city shortcuts.
6. There are no 2013–2014 records after the requested deletion; the first run
   is now 2015-10-06.
