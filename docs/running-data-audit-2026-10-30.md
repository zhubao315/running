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
| `src/static/activities.json` | Runtime data used by the page | 2,034 records, all `type: "Run"` |
| `run_page/data.db` | Audit source of truth | 2,034 `Run` rows |
| `src/static/activities.json` vs DB | Key/date/distance comparison | 0 missing IDs, 0 distance diffs, 0 date diffs |
| `docs/running-monthly-2013-2026.csv` | Monthly breakdown | 134 months with at least one run |
| `run_page/hiking_duplicates.json` | Confirmed hiking pairs | 15 records removed on 2026-11-02 (see §11) |

The runtime JSON is the source for every number on the page. The DB confirms
that the JSON is complete. No record was edited, resampled or zero-filled for
this rebuild.

The only deletion in this dataset is the 15 hiking activities removed on
2026-11-02, documented in §11. Fifteen records were subtracted; nothing was
rewritten in place.

### 1.2 Career totals

| Metric | Value |
| --- | --- |
| Runs | **2,034** |
| Distance | **24,499.83 km** (displayed as 24,499.8 km) |
| Moving time | **8,134,885 s = 2,259 h 41 m 25 s** (page rounds to `2,259 h 41 m`) |
| Weighted pace | **5.5340 min/km = 5'32"/km** |
| First run | **2015-10-06** |
| Latest run | **2026-11-02** (2026 is partial) |
| Active running days | **1,812** |
| Days with 2+ runs | **176** (maximum 4 runs in one day) |
| Longest streak | **15 days**, ending **2020-03-06** |
| Current streak | **1 day** (2026-11-02) |
| Average distance per run | **12.05 km** |
| Average moving time per run | **1 h 06 m 39 s** (page rounds to `1 h 07 m`) |

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
| 2024 | 145 | 2,088.8 | 198.4 | 5'42" | 141 | 141 / 145 |
| 2025 | 142 | 2,065.0 | 192.8 | 5'36" | 139 | 139 / 153 |
| 2026 | 116 | 1,721.0 | 164.1 | 5'43" | 114 | 116 / 151 |

Notes:

- 2017 has one record with `average_heartrate = 0`. It is treated as missing,
  so the year shows 0 valid HR records rather than a 0 bpm average.
- The annual chart now spans 2015–2026 inclusive. The only 2013 record was
  deleted at the user's request, so 2013–2014 no longer appear.
- 2026 ends on 2026-11-02; it is not a full-year comparison.

### 1.4 Field completeness

| Field | Present | Missing | Handling |
| --- | ---: | ---: | --- |
| `run_id` | 2,034 | 0 | Primary key; 0 duplicates |
| `distance` | 2,034 | 0 | 0 zero-distance rows |
| `moving_time` | 2,034 | 0 | 0 zero-duration rows |
| Date | 2,034 | 0 | Invalid dates would be dropped, none found |
| `average_heartrate` | 615 valid (+1 zero) | 1,419 | Mean uses values `> 0`; missing shows `—` |
| `location_country` | 1,732 | 302 | Missing location is not guessed |
| `summary_polyline` | 1,814 | 220 | Runs without a polyline stay out of map lines |
| Elevation gain | 0 | 2,034 | No elevation column exists; climb is not shown |

Additional checks:

- 0 duplicate `run_id`s; 0 duplicate/near-duplicate activities found.
- 0 zero-distance and 0 zero-duration rows.
- 4 runs are longer than 4 hours and slower than 6 km/h
  (20.83 h, 57.1 km). These look like watches left running, but they are
  retained because the source cannot prove an error. Excluding them would
  change the career pace to 5'30"/km; the page keeps the unmodified 5'32"/km.
- Heart-rate coverage is 615 / 2,034 = **30.2%**, mean **148.03 bpm**.
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
A  Profile                 identity, 2015—2026, 2,034 runs, 3 countries / 15 provinces / 28 cities
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
| Data consistency | 2,034 JSON = 2,034 DB; 0 ID/date/distance diffs |
| Zero/duplicate rows | 0 zero distance, 0 zero time, 0 duplicate IDs |

### Browser interactions (Playwright, desktop 1440)

| Scenario | Expected | Result |
| --- | --- | --- |
| Initial load | opens on the newest year by design: 2026, 1,721.0 km, 116 runs | Pass |
| `全部历史` | 24,499.8 km, 2,034 runs, 1,812 running days | Pass |
| Year 2025 | 2,065.0 km, 142 runs, 5'36"/km, calendar follows | Pass |
| October 2025 | 169.2 km, 11 runs, 5'36"/km | Pass |
| 2025-10-05 | 23.89 km, day detail and map title | Pass |
| Select day run | Map title changes, scope stays on the day | Pass |
| Clear | Career totals and all-history scope restored | Pass |
| Pace view | Line + 12 dots, one per year 2015–2026 | Pass |
| Count view | 12 bars, every year has runs (no empty-year marker) | Pass |
| Table pagination | 80 / 2,034 → 160 / 2,034 | Pass |
| KM sort | descending first click: 42.24 km marathon first | Pass |
| City filter 东城区 | Breadcrumb, 13,584.9 km / 977 runs, map follows | Pass |
| Clear after city filter | Career totals restored | Pass |
| Horizontal overflow | 1,440 = 1,440 | Pass |
| The 15 removed dates | absent from trend, table and calendar (calendar cells read `无记录`) | Pass |

### Browser interactions (mobile 390 / 320)

| Check | Result |
| --- | --- |
| Page horizontal overflow | None at 320 and 390 |
| Core metric grid | 2×2 |
| Calendar | 2 columns |
| Day selection + day detail | Pass |
| Table columns | 活动 / KM / Date only (Pace, BPM, Time hidden); 24 rows initially |
| Table overflow | None at 320 and 390; table width = container width (308 px at 390) |
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

- Homepage optimization pushed as commit `13dfc4e` on 2026-10-30.
- CI run `41011696421`: `success`.
- COROS Sync run `41011696431`: `success`; jobs
  `Sync COROS data` and `Build and deploy page` both `success`.
- Live URL: <https://zhubao315.github.io/running/>.
- Live HTML serves `activities-78e7240e.js`, matching the post-deletion build.

## 9. Second-round homepage optimization (2026-10-30)

### 9.1 Module order

The rendered order is now:

1. `01 Running Profile / 个人跑步档案`
2. `02 Core Metrics / 核心数据`
3. `03 Yearly Trend / 年度趋势`
4. `04 Total Journey / 跑步旅程`
5. `05 Activity Explorer / 地图与全部记录`
6. `06 Running Calendar / 跑步日历`

`RunningDashboard` no longer renders the calendar; the calendar and day detail
were moved to the last section in `src/pages/index.tsx`. `JourneyStats`
(Total Journey) was moved before Activity Explorer.

### 9.2 Total Journey bilingual labels

- Geographic Footprint / 城市足迹
- Running Rhythm / 跑步节律
- Personal Bests / 个人最佳
- Fastest Times / 最快时间
- Half Marathon / 半程马拉松
- Full Marathon / 全程马拉松
- Average Pace / 平均配速
- Longest Streak / 最长连续跑步

### 9.3 Personal Bests

Each record is now a button carrying the source `run_id`, label, value, date,
distance, duration, pace and heart rate. Clicking a record opens an inline
detail card with real activity fields and a map action that calls the existing
`selectRun(run_id)` without changing Activity Explorer filters.

Records:

- Longest Distance
- Longest Time (suspicious long/slow runs excluded)
- Fastest Speed
- Fastest Pace

### 9.4 Fastest Times

Buttons: `5K`, `10K`, `Half Marathon`, `Full Marathon`. Clicking a distance
filters single activities whose distance is at least that distance, estimates
`targetDistance / average_speed`, and sorts ascending. The first result is
highlighted. Clicking a result opens the same detail card.

Estimate note shown in the detail card:
“基于单次历史活动的平均配速估算，仅用于个人训练表现参考，不代表官方比赛成绩。”

No cross-activity distance accumulation is used.

### 9.5 Activity Explorer linkage

- Record clicks set only `selectedRunId`; they do not reset year/month/date
  or quick filters.
- Map and 3D terrain reuse the existing components.
- Returning from a detail keeps the previous list state.

### 9.6 Running Calendar

The calendar remains the last module. Existing capabilities are unchanged:
year navigation, daily km colour levels, multiple-run dots, day detail,
activity selection and map linkage.

### 9.7 Data audit

No historical record was rewritten in this round. Two deletions exist in the
dataset:

- the single 2013 record, removed earlier at the user's request;
- the 15 hiking activities removed on 2026-11-02 (§11), which were the same
  physical sessions already counted on the hiking site.

### 9.8 Build

- `node_modules/.bin/tsc --noEmit`: pass
- `PATH_PREFIX=/running pnpm build`: pass
- Desktop/mobile interaction checks: pass
- Console: only the existing two non-fatal MapLibre warnings

## 10. Known limitations

1. Elevation gain is absent from every record and from the DB schema. The
   dashboard does not show cumulative climb; it says so in the data notes.
2. Heart rate is only 30.2% covered and effectively starts in 2022. No
   pre-2022 comparison is implied.
3. 2026 is partial (through 2026-11-02).
4. 4 long/slow records are retained as recorded. They affect total time and
   pace; the page documents them instead of silently deleting them.
5. 302 records have no device location and 220 have no polyline. They still
   count toward totals. 91 of the 302 now appear in the geographic module
   through the track-derived `location_resolved` (§12); the 208 without a
   polyline stay unnamed, and 3 whose track falls outside every polygon stay
   unnamed too.
6. There are no 2013–2014 records after the requested deletion; the first run
   is now 2015-10-06.

## 11. Hiking duplicates removed (2026-11-02)

### 11.1 Why

The watch records every hike under a running sport type. The COROS sync puts
those sessions into the running dataset, and they are also counted on the
hiking site (<https://zhubao315.github.io/hiking/>). The same physical activity
was therefore counted twice across the two sites: once as a run, once as a hike.

The overlap is visible in the running data as a block of “runs” with hiking
characteristics: 4–8 h duration, 2.5–3.5 km/h, low heart rate (102–142 bpm) and
the generic name `跑步`. Speed alone is not a usable filter — 67 rows are slower
than 1.6 m/s, but only 15 of them match a real hike.

### 11.2 How the match was made

`run_id` values are **not** shared between the two repositories (running 2,048
ids, hiking 344 ids, zero overlap), and the activity name is not a
discriminator. The join key is therefore the activity itself:

- same local start time within 180 s, **and**
- same distance within `max(50 m, 2 %)`.

Both conditions must hold. All 15 pairs matched at Δ0 s and Δ0.0 m, which makes
the match exact rather than heuristic.

### 11.3 The 15 records

| Removed `run_id` | Date / start | km | Moving time | Pace | Hiking twin (`run_id`) |
| --- | --- | ---: | ---: | ---: | --- |
| 383426480 | 2024-02-13 08:58:49 | 12.15 | 3:02:19 | 15'00" | 1707785929000 |
| 385984433 | 2024-04-13 08:17:47 | 22.67 | 6:26:26 | 17'03" | 1712967467000 |
| 395010627 | 2024-10-01 10:51:48 | 19.79 | 3:41:02 | 11'10" | 1727751108000 |
| 404282962 | 2025-05-01 07:41:19 | 14.42 | 3:44:52 | 15'35" | 1746056479000 |
| 404464163 | 2025-05-05 07:58:25 | 18.67 | 5:09:14 | 16'34" | 1746403105000 |
| 405836792 | 2025-05-31 07:01:55 | 29.15 | 6:34:32 | 13'32" | 1748646115000 |
| 412034121 | 2025-10-01 09:07:44 | 15.31 | 4:05:13 | 16'01" | 1759280864000 |
| 412076331 | 2025-10-02 08:11:26 | 9.15 | 4:01:28 | 26'24" | 1759363886000 |
| 412282188 | 2025-10-07 08:27:16 | 21.92 | 6:48:31 | 18'38" | 1759796836000 |
| 417664312 | 2026-02-19 09:19:01 | 11.49 | 3:40:13 | 19'10" | 1771463941000 |
| 419695159 | 2026-04-12 09:58:40 | 17.90 | 5:00:51 | 16'48" | 1775959120000 |
| 420521938 | 2026-05-01 08:13:47 | 25.06 | 6:58:16 | 16'41" | 1777594427000 |
| 426752284 | 2026-09-27 08:44:34 | 17.35 | 4:40:42 | 16'11" | 1790469874000 |
| 426909702 | 2026-10-01 11:05:20 | 15.83 | 3:41:40 | 14'00" | 1790823920000 |
| 427008053 | 2026-10-03 09:15:47 | 16.12 | 8:10:31 | 30'26" | 1790990147000 |

Total removed: **266.99 km**, **272,750 s (75.76 h)**.

None of the 15 carried `location_country`, which is why the geographic
footprint (3 countries / 15 provinces / 28 cities) is unchanged. All 15 carried
a polyline and a heart-rate average; that is why map lines drop by exactly 15
(1,828 → 1,813 at exclusion time; 1,814 after the 2026-11-02 run) and valid HR
records drop by 15 (629 → 614; 615 after that run).

### 11.4 Mechanism

Deletion is data-level and repeatable, not a one-off edit:

| File | Role |
| --- | --- |
| `run_page/hiking_duplicates.json` | Checked-in manifest of the 15 confirmed pairs, each carrying the hiking twin id and both sides' start time, distance and moving time |
| `run_page/refresh_hiking_duplicates.py` | Re-runs the cross-dataset match against the hiking site's published `activities.json` and appends any new pair to the manifest; dry run by default, `--execute` to write, `--soft-fail` for CI |
| `run_page/exclude_hiking_dupes_rh.py` | Removes manifest-listed ids from `activities.json` and `data.db`; dry run by default, `--execute` to write |

Guards before a record is deleted:

- the id must be on the manifest;
- the record's `start_date_local` must match the manifest within
  `--start-tolerance` (default 180 s);
- the record's distance must match within
  `max(--min-distance 50 m, --distance-tolerance 2 %)`;
- a moving-time difference is reported but not fatal, because the DB stores
  it as `HH:MM:SS` while the JSON stores it as `H:MM:SS`;
- any mismatch is **refused** and reported, and the script exits non-zero.

Because the step runs on every sync, a re-downloaded FIT file cannot silently
reintroduce a record: the sync rebuilds the data from the watch and DB, and this
step removes the 15 ids again in the same run. Re-running it against already
cleaned data is a no-op (`15 absent`, exit 0).

Discovery is automated as well. Until 2026-11-05 the manifest was hand-maintained,
so a hike taken after that date stayed double-counted until someone noticed it.
`refresh_hiking_duplicates.py` now runs immediately before the exclusion step and
applies the same tolerance criteria to the hiking site's live dataset, appending
every new pair. It is append-only by design: an entry whose running record is
absent from the dataset *is* the exclusion, so pruning old entries would
resurrect those records on the next rebuild. Against the current published data
the run reports `matched=0 new=0 already-excluded=15` — the 15 pairs are already
gone from `activities.json`, which is exactly the proof that the matcher and the
manifest agree. On the pre-exclusion snapshot of the same file it reproduces
precisely those 15 pairs (all with a 0 s start delta and 0.0 m distance delta) and
matches none of the 2,035 genuine runs, so the false-positive rate is zero.

The lag is set by the hiking schedule, not by the logic: hiking syncs weekly
(Mondays 08:30 Asia/Shanghai, plus Thursdays in May and October), so a hike only
enters the hiking dataset at its next sync and is excluded from this site at the
first running sync after that — at most about a week. Until the hiking repo gains
a daily schedule, the window in which one session is counted twice is a property
of the schedules, and `matched=0` on every run is what confirms nothing was
missed. If the hiking fetch fails, `--soft-fail` keeps the committed manifest and
the deploy proceeds, which degrades to the previous manual-maintenance behaviour
instead of blocking the page.

### 11.5 Before / after (exclusion delta only)

| Metric | Before | After the 15 removals |
| --- | ---: | ---: |
| Runs | 2,048 | **2,033** |
| Distance | 24,753.67 km | **24,486.69 km** |
| Moving time | 8,403,342 s (2,334 h 15 m) | **8,130,592 s (2,258 h 29 m)** |
| Weighted pace | 5'39"/km | **5'32"/km** |
| Active days | 1,826 | **1,811** |
| Valid HR / mean | 629 / 147.29 | **614 / 148.00** |
| Polyline coverage | 1,828 | **1,813** |
| Runs >4 h and <6 km/h | 14 | **4** |
| 2024 | 148 runs, 2,143.4 km | **145, 2,088.8 km** |
| 2025 | 148 runs, 2,173.6 km | **142, 2,065.0 km** |
| 2026 | 121 runs, 1,811.6 km | **115, 1,707.8 km** |

2015–2023 are unchanged: no hiking pair falls in those years.

### 11.6 Derived artefacts refreshed

- `assets/github.svg` — 2,047 → 2,032 tracks, 24,758.9 → 24,499.3 km. The
  long-stale empty `2013` row is gone from the heatmap, so the poster height
  drops from 614 mm to 571 mm.
- `assets/grid.svg` — 102 → 98 tracks (20 km+), 2,353.3 → 2,254.5 km.
- `assets/github_2026.svg` — 120 → 115 tracks, 1,811.4 → 1,720.8 km.
- `assets/year_*.svg` — regenerated; 2024–2026 changed content, 2015–2023
  changed only `idN` numbering.
- `README.md` stats row — `2,034 次跑步 | 24,500 km | — | 2015–2026 | 2026-11-02`.
- `docs/running-monthly-2013-2026.csv` — 10 affected month rows patched in
  place (CRLF preserved). Three pre-existing generator rounding artefacts
  (`2020-07 5'00" → 4'60"`, `2021-07 14.25 → 14.24`, `2022-07 153.7 → 153.6`)
  were left untouched because they are unrelated to this change.

### 11.7 Verification

| Check | Result |
| --- | --- |
| Dry run against the manifest | 15/15 matched, 0 refused |
| Negative test (corrupted distance + start time) | 2 entries refused, exit non-zero |
| `--execute` | JSON and DB both 2,048 → 2,033 (2,034 after the 11-02 run); 0 leftover ids |
| Idempotent second run | `15 absent`, 0 removed, exit 0 |
| JSON still parses | OK; compact `ensure_ascii=False` round-trip byte-identical |
| DB total = JSON total | 2,034 = 2,034, km 24,499.83 = 24,499.83 |

### 11.8 Residual risk

- The manifest is a curated allowlist. A **new** hike recorded by the watch will
  appear in the running dataset until someone adds it. Detection is manual:
  look for runs of 4 h+ at under 4 km/h and check the hiking site for a session
  at the same time. The 15 known pairs are handled automatically.
- If a record's start time or distance is later corrected upstream by more than
  the tolerance, the script refuses to delete it and fails the workflow loudly
  instead of deleting the wrong row. That is intentional.

### 11.9 Same-day COROS sync

The scheduled sync ran at 2026-11-02 05:52 UTC and committed `b6da296`. As
expected, it re-imported the 15 hikes from their tracked FIT files, and it also
brought one genuine new run (2026-11-02 06:22, 13.14 km, 1 h 11 m, HR 167,
东城区). The exclusion step was re-applied on top of that commit, so the shipped
dataset is:

| Metric | Shipped value |
| --- | ---: |
| Runs | **2,034** |
| Distance | **24,499.83 km** |
| Moving time | **8,134,885 s (2,259 h 41 m)** |
| Active days | **1,812** |
| 2026 | 116 runs, 1,721.0 km |

This is the state every number in §1 describes. It also confirms the mechanism
end to end: a sync that re-downloads the hikes cannot reintroduce them, because
the exclusion runs after the sync and before the SVG / README / parquet steps.


## 12. Locations derived from GPS tracks (2026-11-06)

1,733 of the 2,035 records carry the place string the watch wrote. The other 302
carry none, so they counted in every total while appearing nowhere in the
geographic module. `run_page/resolve_locations_rh.py` places them offline:

1. the encoded polyline is decoded in pure Python (Google precision 5, the format
   the site already stores);
2. the **first fix** is tested, and only if it falls outside every polygon is the
   median fix tried;
3. inside China the 34 province polygons the site already ships are used
   (`run_page/assets/china_provinces.json`, extracted from
   `src/static/run_countries.ts`, so the layer that draws the map is the layer
   that names the place); outside China, 239 country polygons
   (`run_page/assets/world_countries.json`, public-domain Natural Earth data via
   `surbowl/world-geo-json-zh`, with the China feature dropped because the
   province layer is finer);
4. containment is ray casting behind a bounding-box prefilter, outer ring minus
   holes, so enclaves and lakes are respected.

No network, no geocoder, no "nearest city" approximation.

The answer goes to a new field, `location_resolved`, spelled exactly like the tail
of a device address (`陕西省, 中国`, or `日本`). `location_country` is never
touched: the device value always wins and the raw record keeps its shape.
`locationForRun` reads `location_country || location_resolved`, the Profile foot
line names both sources separately (`地点来源：设备原生 1,733 次，轨迹坐标解析 91 次`)
and `run_page/data.db` receives the same values in a column of the same name,
joined on `run_id`, so the two copies of the dataset stay comparable.

Accuracy was measured before anything was written. Every record that already
carries a device place was resolved again from its own track and compared:
**1,682 of 1,682 comparable records agree, 0 disagree** (comparable = the watch's
string names a province and the track falls inside a polygon). `--verify` re-runs
that comparison and exits non-zero below 95%, so a future change of boundaries is
checked rather than trusted.

| step | records |
| --- | ---: |
| no device location | 302 |
| ... and no GPS line at all, left empty | 208 |
| ... placed from the first fix | 90 |
| ... placed from the median fix (first fix sat offshore) | 1 |
| ... line outside every polygon, left empty | 3 |
| **derived locations written** | **91** |

The 91 are 北京市 73 · 日本 6 · 河南省 3 · 陕西省 3 · 广东省 2 · 泰国 2 · 天津市 1 ·
辽宁省 1, and the DB mirror matched all 91 rows (0 unmatched). The number of
distinct places does not grow — normalising device addresses to the same spelling,
the dataset named 17 places before and 17 after; what changes is that 91
activities now belong to one of them instead of to none. The 208 without a track
stay empty, because inventing a city for a record with no coordinates is exactly
the silent fill this dataset rejects.

In `coros_sync.yml` the step `Resolve locations from tracks` sits after the data
steps and immediately before `Check dataset integrity`
(`run_page/check_data_integrity_rh.py --sport running`), which compares the
published JSON with `data.db` — id sets, distances, start times, total distance
and the device / derived location split — and refuses the commit on a mismatch.
Derived locations are therefore regenerated by CI from the live data; no locally
regenerated JSON is committed.

Live check after that pass deployed (1440×900, 390×844, 320×568): the Profile line
reads 设备原生 1,733 次 / 轨迹坐标解析 91 次, page errors 0, console errors 0 apart
from library warnings, horizontal overflow 0.
