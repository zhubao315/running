import {
  Activity,
  convertMovingTime2Sec,
  locationForRun,
} from '@/utils/utils';

/**
 * Single source of truth for every number on the dashboard.
 *
 * Rules:
 * - only `Run` records enter the running totals (cycling/hiking never mix in);
 * - records are de-duplicated by run_id and invalid rows are dropped, never zero-filled;
 * - a missing value is `null` (rendered as "—"), not 0;
 * - pace is always the weighted figure: total seconds / total kilometres.
 */

export type MetricKey = 'distance' | 'count' | 'duration' | 'pace';

export interface RunRecord extends Activity {
  date: string;
  year: number;
  month: number;
  day: number;
  distanceKm: number;
  seconds: number;
  paceSecondsPerKm: number | null;
}

export interface RunningDataset {
  runs: RunRecord[];
  dropped: number;
}

export interface Totals {
  count: number;
  distanceKm: number;
  seconds: number;
  paceSecondsPerKm: number | null;
  hrCount: number;
  hrAverage: number | null;
  activeDays: number;
  firstDate: string | null;
  lastDate: string | null;
  longestStreak: number;
  currentStreak: number;
  averageDistanceKm: number | null;
  averageSeconds: number | null;
}

export interface YearPoint extends Totals {
  year: number;
}

export interface DayStat extends Totals {
  date: string;
  runs: RunRecord[];
}

export interface CalendarCell {
  day: number;
  date: string;
  count: number;
  distanceKm: number;
  seconds: number;
  paceSecondsPerKm: number | null;
  runs: RunRecord[];
}

export interface CalendarMonth extends Totals {
  month: number;
  cells: Array<CalendarCell | null>;
}

export interface CalendarYear {
  year: number;
  months: CalendarMonth[];
  totals: Totals;
}

export interface RunScope {
  year: string; // 'all' or 'YYYY'
  month: number | null;
  date: string | null;
}

export interface GeoSummary {
  countries: string[];
  provinces: string[];
  cities: string[];
  homeProvince: string | null;
}

export const METRICS: Array<{
  key: MetricKey;
  label: string;
  hint: string;
}> = [
  { key: 'distance', label: '跑量', hint: '每年累计公里' },
  { key: 'count', label: '次数', hint: '每年跑步次数' },
  { key: 'duration', label: '时间', hint: '每年累计时长' },
  { key: 'pace', label: '配速', hint: '加权平均配速，越低越快' },
];

export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const number = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: 0 });

const parseRunDate = (
  value: string | undefined
): { date: string; year: number; month: number; day: number } | null => {
  if (!value) return null;
  const date = value.slice(0, 10);
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { date, year, month, day };
};

const paceFromRun = (
  speed: number | undefined,
  distanceKm: number,
  seconds: number
): number | null => {
  if (speed && Number.isFinite(speed) && speed > 0) {
    return 1000 / speed;
  }
  if (distanceKm > 0 && seconds > 0) {
    return seconds / distanceKm;
  }
  return null;
};

/**
 * De-duplicate by run_id, keep only Run records with a usable date, distance
 * and duration. Nothing is repaired with a zero.
 */
export const buildDataset = (raw: readonly Activity[]): RunningDataset => {
  const seen = new Set<number>();
  const runs: RunRecord[] = [];
  let dropped = 0;

  for (const activity of raw) {
    if (!activity || !/^run$/i.test(activity.type || '')) {
      dropped += 1;
      continue;
    }
    if (seen.has(activity.run_id)) {
      dropped += 1;
      continue;
    }
    seen.add(activity.run_id);

    const parsed = parseRunDate(activity.start_date_local);
    const distanceKm = activity.distance / 1000;
    const seconds = convertMovingTime2Sec(activity.moving_time);

    if (
      !parsed ||
      !Number.isFinite(distanceKm) ||
      distanceKm <= 0 ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    ) {
      dropped += 1;
      continue;
    }

    runs.push({
      ...activity,
      ...parsed,
      distanceKm,
      seconds,
      paceSecondsPerKm: paceFromRun(
        activity.average_speed,
        distanceKm,
        seconds
      ),
    });
  }

  return { runs, dropped };
};

const dayDiff = (a: string, b: string): number =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000
  );

const streaks = (dates: string[]): { longest: number; current: number } => {
  if (!dates.length) return { longest: 0, current: 0 };
  const sorted = [...new Set(dates)].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    run = dayDiff(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  let current = 1;
  for (let i = sorted.length - 1; i > 0; i -= 1) {
    if (dayDiff(sorted[i - 1], sorted[i]) !== 1) break;
    current += 1;
  }
  return { longest, current };
};

export const computeTotals = (runs: readonly RunRecord[]): Totals => {
  let distanceKm = 0;
  let seconds = 0;
  let hrCount = 0;
  let hrSum = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const run of runs) {
    distanceKm += run.distanceKm;
    seconds += run.seconds;
    if (run.average_heartrate) {
      hrCount += 1;
      hrSum += run.average_heartrate;
    }
    if (!firstDate || run.date < firstDate) firstDate = run.date;
    if (!lastDate || run.date > lastDate) lastDate = run.date;
  }

  const activeDates = runs.map((run) => run.date);
  const { longest, current } = streaks(activeDates);

  return {
    count: runs.length,
    distanceKm,
    seconds,
    paceSecondsPerKm:
      runs.length && distanceKm > 0 && seconds > 0
        ? seconds / distanceKm
        : null,
    hrCount,
    hrAverage: hrCount ? hrSum / hrCount : null,
    activeDays: new Set(activeDates).size,
    firstDate,
    lastDate,
    longestStreak: longest,
    currentStreak: runs.length ? current : 0,
    averageDistanceKm: runs.length ? distanceKm / runs.length : null,
    averageSeconds: runs.length ? seconds / runs.length : null,
  };
};

export const availableYears = (runs: readonly RunRecord[]): number[] =>
  [...new Set(runs.map((run) => run.year))].sort((a, b) => a - b);

export const buildYearSeries = (runs: readonly RunRecord[]): YearPoint[] => {
  const years = availableYears(runs);
  if (!years.length) return [];

  const byYear = new Map<number, RunRecord[]>();
  for (const run of runs) {
    const bucket = byYear.get(run.year);
    if (bucket) bucket.push(run);
    else byYear.set(run.year, [run]);
  }

  const out: YearPoint[] = [];
  for (let year = years[0]; year <= years[years.length - 1]; year += 1) {
    out.push({ year, ...computeTotals(byYear.get(year) ?? []) });
  }
  return out;
};

export const buildDayMap = (
  runs: readonly RunRecord[]
): Map<string, DayStat> => {
  const byDate = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const bucket = byDate.get(run.date);
    if (bucket) bucket.push(run);
    else byDate.set(run.date, [run]);
  }
  const map = new Map<string, DayStat>();
  byDate.forEach((dayRuns, date) => {
    map.set(date, { date, runs: dayRuns, ...computeTotals(dayRuns) });
  });
  return map;
};

export const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

/** Monday-first offset: 0 = Monday, 6 = Sunday. */
export const firstWeekdayOffset = (year: number, month: number): number =>
  (new Date(year, month - 1, 1).getDay() + 6) % 7;

export const buildCalendar = (
  runs: readonly RunRecord[],
  year: number
): CalendarYear => {
  const yearRuns = runs.filter((run) => run.year === year);
  const dayMap = buildDayMap(yearRuns);
  const months: CalendarMonth[] = [];

  for (let month = 1; month <= 12; month += 1) {
    const monthRuns = yearRuns.filter((run) => run.month === month);
    const cells: Array<CalendarCell | null> = [];
    const offset = firstWeekdayOffset(year, month);
    for (let i = 0; i < offset; i += 1) cells.push(null);

    const total = daysInMonth(year, month);
    for (let day = 1; day <= total; day += 1) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(
        day
      ).padStart(2, '0')}`;
      const stat = dayMap.get(date);
      cells.push({
        day,
        date,
        count: stat?.count ?? 0,
        distanceKm: stat?.distanceKm ?? 0,
        seconds: stat?.seconds ?? 0,
        paceSecondsPerKm: stat?.paceSecondsPerKm ?? null,
        runs: stat?.runs ?? [],
      });
    }

    months.push({ month, cells, ...computeTotals(monthRuns) });
  }

  return { year, months, totals: computeTotals(yearRuns) };
};

export const filterRunsByScope = (
  runs: readonly RunRecord[],
  scope: RunScope
): RunRecord[] => {
  if (scope.date) {
    return runs.filter((run) => run.date === scope.date);
  }
  if (scope.year === 'all') return [...runs];
  const year = Number(scope.year);
  return runs.filter(
    (run) =>
      run.year === year &&
      (scope.month === null || run.month === scope.month)
  );
};

export const scopeLabel = (scope: RunScope): string => {
  if (scope.date) return formatDateCN(scope.date);
  if (scope.year === 'all') return '全部历史';
  if (scope.month) return `${scope.year} 年 ${scope.month} 月`;
  return `${scope.year} 年`;
};

export const formatNumber = number;

export const formatDistanceKm = (km: number | null): string => {
  if (km === null || !Number.isFinite(km)) return '—';
  return km.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: km >= 100 ? 1 : 2,
  });
};

export const formatPaceSeconds = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `${minutes}'${String(rest).padStart(2, '0')}"`;
};

export const formatDurationLong = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} m`;
  return `${formatNumber(hours)} h ${String(minutes).padStart(2, '0')} m`;
};

export const formatRunClock = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const formatDateCN = (date: string): string => {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
};

export const formatDateShort = (date: string): string => {
  const [, month, day] = date.split('-');
  return `${Number(month)}.${String(Number(day)).padStart(2, '0')}`;
};

export const formatMonthCN = (month: number): string => `${month} 月`;

export const weekdayCN = (date: string): string => {
  const index = new Date(`${date}T00:00:00`).getDay();
  return `周${['日', '一', '二', '三', '四', '五', '六'][index]}`;
};

/** 0 = no run, 1 = <10 km, 2 = 10–15, 3 = 15–20, 4 = 20–30, 5 = 30+. */
export const calendarLevel = (km: number): 0 | 1 | 2 | 3 | 4 | 5 => {
  if (!(km > 0)) return 0;
  if (km < 10) return 1;
  if (km < 15) return 2;
  if (km < 20) return 3;
  if (km < 30) return 4;
  return 5;
};

export const metricNumber = (
  point: Totals,
  metric: MetricKey
): number | null => {
  switch (metric) {
    case 'distance':
      return point.distanceKm;
    case 'count':
      return point.count;
    case 'duration':
      return point.seconds;
    case 'pace':
      return point.paceSecondsPerKm;
  }
};

export const formatMetric = (point: Totals, metric: MetricKey): string => {
  switch (metric) {
    case 'distance':
      return `${formatDistanceKm(point.distanceKm)} km`;
    case 'count':
      return `${formatNumber(point.count)} 次`;
    case 'duration':
      return formatDurationLong(point.seconds);
    case 'pace':
      return `${formatPaceSeconds(point.paceSecondsPerKm)}/km`;
  }
};

export const computeGeo = (runs: readonly RunRecord[]): GeoSummary => {
  const provinces = new Map<string, number>();
  const countries = new Set<string>();
  const cities = new Set<string>();

  for (const run of runs) {
    const location = locationForRun(run);
    if (location.country) countries.add(location.country);
    if (location.province) {
      provinces.set(
        location.province,
        (provinces.get(location.province) ?? 0) + run.distanceKm
      );
    }
    if (location.city.length > 1) cities.add(location.city);
  }

  const provinceRanking = [...provinces.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  const homeProvince = provinceRanking.length
    ? provinceRanking[0][0]
        .replace(/(维吾尔|壮族|回族)?自治区$/, '')
        .replace(/特别行政区$/, '')
        .replace(/[省市]$/, '')
    : null;

  return {
    countries: [...countries],
    provinces: provinceRanking.map(([name]) => name),
    cities: [...cities],
    homeProvince: homeProvince || null,
  };
};
