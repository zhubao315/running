import { useMemo } from 'react';
import {
  buildYearSeries,
  computeTotals,
  formatDateCN,
  formatDistanceKm,
  formatNumber,
  type RunRecord,
} from '@/utils/runningStats';
import styles from './TrainingAnalysis.module.css';

interface ITrainingAnalysisProps {
  runs: RunRecord[];
  scopeLabel: string;
}

const DAY_MS = 86400000;

const dayMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Monday-first start of the ISO week containing `date`. */
const mondayMs = (date: string): number => {
  const ms = dayMs(date);
  return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;
};

const axisMonthDay = (date: string): string => {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
};

interface VolumeBucket {
  key: string;
  axis: string;
  label: string;
  distanceKm: number;
  count: number;
}

const buildWeekBuckets = (
  runs: readonly RunRecord[],
  lastDate: string
): VolumeBucket[] => {
  const lastMonday = mondayMs(lastDate);
  const buckets: VolumeBucket[] = [];

  for (let i = 11; i >= 0; i -= 1) {
    const start = lastMonday - i * 7 * DAY_MS;
    const startDate = isoDay(start);
    buckets.push({
      key: startDate,
      axis: axisMonthDay(startDate),
      label: `${startDate} – ${isoDay(start + 6 * DAY_MS)}`,
      distanceKm: 0,
      count: 0,
    });
  }

  for (const run of runs) {
    const index =
      11 - Math.floor((lastMonday - mondayMs(run.date)) / (7 * DAY_MS));
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].distanceKm += run.distanceKm;
    buckets[index].count += 1;
  }

  return buckets;
};

const buildMonthBuckets = (
  runs: readonly RunRecord[],
  lastDate: string
): VolumeBucket[] => {
  const lastYear = Number(lastDate.slice(0, 4));
  const lastMonth = Number(lastDate.slice(5, 7));
  const buckets: VolumeBucket[] = [];

  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(lastYear, lastMonth - 1 - i, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    buckets.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      axis: `${month}月`,
      label: `${year} 年 ${month} 月`,
      distanceKm: 0,
      count: 0,
    });
  }

  const byKey = new Map(
    buckets.map((bucket): [string, VolumeBucket] => [bucket.key, bucket])
  );
  for (const run of runs) {
    const bucket = byKey.get(
      `${run.year}-${String(run.month).padStart(2, '0')}`
    );
    if (!bucket) continue;
    bucket.distanceKm += run.distanceKm;
    bucket.count += 1;
  }

  return buckets;
};

const buildYearBuckets = (runs: readonly RunRecord[]): VolumeBucket[] =>
  buildYearSeries(runs).map((point) => ({
    key: String(point.year),
    axis: String(point.year).slice(2),
    label: `${point.year} 年`,
    distanceKm: point.distanceKm,
    count: point.count,
  }));

const bucketTitle = (bucket: VolumeBucket): string =>
  `${bucket.label} · ${formatDistanceKm(bucket.distanceKm)} km · ${formatNumber(
    bucket.count
  )} 次`;

interface IBarSeriesProps {
  title: string;
  hint: string;
  buckets: VolumeBucket[];
  emptyLabel: string;
}

const BarSeries = ({ title, hint, buckets, emptyLabel }: IBarSeriesProps) => {
  const max = buckets.reduce(
    (value, bucket) => Math.max(value, bucket.distanceKm),
    0
  );
  const width = buckets.length * 10;

  return (
    <div className={styles.seriesCard}>
      <div className={styles.seriesHead}>
        <span className={styles.seriesTitle}>{title}</span>
        <span className={styles.seriesHint}>{hint}</span>
      </div>
      {buckets.length ? (
        <>
          <svg
            className={styles.seriesSvg}
            viewBox={`0 0 ${width} 100`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${title}，单位公里`}
          >
            {buckets.map((bucket, index) => {
              const height =
                bucket.count > 0 && max > 0
                  ? Math.max((bucket.distanceKm / max) * 100, 2)
                  : 0;
              const x = index * 10 + 1;
              if (!height) {
                return (
                  <rect
                    key={bucket.key}
                    className={styles.stub}
                    x={x}
                    y={99}
                    width={8}
                    height={1}
                    fill="currentColor"
                  >
                    <title>{bucketTitle(bucket)}</title>
                  </rect>
                );
              }
              return (
                <rect
                  key={bucket.key}
                  className={styles.bar}
                  x={x}
                  y={100 - height}
                  width={8}
                  height={height}
                  fill="currentColor"
                >
                  <title>{bucketTitle(bucket)}</title>
                </rect>
              );
            })}
          </svg>
          <div
            className={styles.seriesAxis}
            style={{
              gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))`,
            }}
          >
            {buckets.map((bucket) => (
              <span key={bucket.key}>{bucket.axis}</span>
            ))}
          </div>
        </>
      ) : (
        <p className={styles.chartEmpty}>{emptyLabel}</p>
      )}
    </div>
  );
};

interface IHrRun extends RunRecord {
  average_heartrate: number;
}

const HR_ZONES = [
  { label: '恢复', range: '<120', min: 0, max: 120, alpha: 26 },
  { label: '有氧', range: '120–139', min: 120, max: 140, alpha: 38 },
  { label: '节奏', range: '140–154', min: 140, max: 155, alpha: 52 },
  { label: '阈值', range: '155–169', min: 155, max: 170, alpha: 66 },
  { label: '高强度', range: '≥170', min: 170, max: Infinity, alpha: 84 },
];

const INTENSITY_LEVELS = [
  { key: 'easy', label: '轻松', range: '<140', min: 0, max: 140, alpha: 34 },
  {
    key: 'moderate',
    label: '中等',
    range: '140–159',
    min: 140,
    max: 160,
    alpha: 60,
  },
  {
    key: 'hard',
    label: '高强度',
    range: '≥160',
    min: 160,
    max: Infinity,
    alpha: 88,
  },
];

const TrainingAnalysis = ({ runs, scopeLabel }: ITrainingAnalysisProps) => {
  const totals = useMemo(() => computeTotals(runs), [runs]);

  const volumes = useMemo(() => {
    if (!totals.lastDate) {
      return { weeks: [], months: [], years: [] };
    }
    return {
      weeks: buildWeekBuckets(runs, totals.lastDate),
      months: buildMonthBuckets(runs, totals.lastDate),
      years: buildYearBuckets(runs),
    };
  }, [runs, totals.lastDate]);

  const hrRuns = useMemo(
    () =>
      runs.filter(
        (run): run is IHrRun =>
          typeof run.average_heartrate === 'number' &&
          Number.isFinite(run.average_heartrate) &&
          run.average_heartrate > 0
      ),
    [runs]
  );

  const hr = useMemo(() => {
    const covered = hrRuns.length;
    const zones = HR_ZONES.map((zone) => {
      const count = hrRuns.filter(
        (run) =>
          run.average_heartrate >= zone.min && run.average_heartrate < zone.max
      ).length;
      return { ...zone, count, ratio: covered ? count / covered : 0 };
    });
    const levels = INTENSITY_LEVELS.map((level) => {
      const count = hrRuns.filter(
        (run) =>
          run.average_heartrate >= level.min &&
          run.average_heartrate < level.max
      ).length;
      return { ...level, count, ratio: covered ? count / covered : 0 };
    });
    return { covered, zones, levels };
  }, [hrRuns]);

  const hrCoverage = totals.count
    ? Math.round((hr.covered / totals.count) * 100)
    : 0;

  const spanWeeks =
    totals.firstDate && totals.lastDate
      ? Math.floor(
          (dayMs(totals.lastDate) - dayMs(totals.firstDate)) / (7 * DAY_MS)
        ) + 1
      : 0;
  const perWeek = spanWeeks ? totals.count / spanWeeks : 0;

  if (!runs.length) {
    return (
      <p className={styles.emptyState}>
        {scopeLabel} 范围内没有跑步记录，训练分析暂无数据。
      </p>
    );
  }

  return (
    <div className={styles.panel}>
      <p className={styles.caption}>
        <span className={styles.captionScope}>{scopeLabel}</span>
        <span>
          {formatNumber(totals.count)} 次 ·{' '}
          {formatDateCN(totals.firstDate as string)} →{' '}
          {formatDateCN(totals.lastDate as string)}
        </span>
      </p>

      <div className={styles.volumeGrid}>
        <BarSeries
          title="近 12 周"
          hint="km"
          buckets={volumes.weeks}
          emptyLabel="暂无周数据"
        />
        <BarSeries
          title="近 12 个月"
          hint="km"
          buckets={volumes.months}
          emptyLabel="暂无月数据"
        />
        <BarSeries
          title="历年跑量"
          hint="km"
          buckets={volumes.years}
          emptyLabel="暂无年度数据"
        />
      </div>
      <p className={styles.note}>
        周为 ISO
        周（周一起），以范围内最近一次训练所在周为终点；无记录的周/月/年只保留基线短标记（0
        次），不补造跑量。
      </p>

      <div className={styles.frequencyGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>平均每周次数</span>
          <p className={styles.statValue}>
            {perWeek.toFixed(1)}
            <span className={styles.statUnit}>次/周</span>
          </p>
          <p className={styles.statSub}>
            {formatNumber(totals.count)} 次 ÷ {formatNumber(spanWeeks)} 周
          </p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>累计活跃天数</span>
          <p className={styles.statValue}>
            {formatNumber(totals.activeDays)}
            <span className={styles.statUnit}>天</span>
          </p>
          <p className={styles.statSub}>
            {formatNumber(totals.count)} 次跑步 · 区间含首尾
          </p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>最长连续训练天数</span>
          <p className={styles.statValue}>
            {formatNumber(totals.longestStreak)}
            <span className={styles.statUnit}>天</span>
          </p>
          <p className={styles.statSub}>按跑步日期连续计算</p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>当前连续训练天数</span>
          <p className={styles.statValue}>
            {formatNumber(totals.currentStreak)}
            <span className={styles.statUnit}>天</span>
          </p>
          <p className={styles.statSub}>截至 {totals.lastDate as string}</p>
        </div>
      </div>
      <p className={styles.note}>
        频率与连续性统计区间：{formatDateCN(totals.firstDate as string)} →{' '}
        {formatDateCN(totals.lastDate as string)}（含首尾），共{' '}
        {formatNumber(spanWeeks)} 周；平均每周次数 = 总次数 ÷ 周数。
      </p>

      <div className={styles.hrGrid}>
        <div className={styles.hrPanel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>心率区间分布</span>
            <span className={styles.panelHint}>平均心率 · 近似</span>
          </div>
          {hr.covered ? (
            <>
              <p className={styles.coverage}>
                有心率记录 <strong>{formatNumber(hr.covered)}</strong> / 总次数{' '}
                <strong>{formatNumber(totals.count)}</strong>（{hrCoverage}%）
              </p>
              <div className={styles.zoneRows}>
                {hr.zones.map((zone) => (
                  <div key={zone.label} className={styles.zoneRow}>
                    <span className={styles.zoneName}>{zone.label}</span>
                    <span className={styles.zoneRange}>{zone.range}</span>
                    <span className={styles.zoneTrack}>
                      <span
                        className={styles.zoneFill}
                        style={{
                          width: zone.count
                            ? `${Math.max(zone.ratio * 100, 2)}%`
                            : '0',
                          background: `color-mix(in srgb, var(--accent) ${zone.alpha}%, transparent)`,
                        }}
                      />
                    </span>
                    <span className={styles.zoneCount}>
                      {formatNumber(zone.count)} 次 ·{' '}
                      {Math.round(zone.ratio * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.hrEmpty}>当前范围内没有心率记录</p>
          )}
          <p className={styles.note}>
            没有心率记录的 {formatNumber(totals.count - hr.covered)}{' '}
            条不计入分母，也绝不视为
            0；区间按每次活动的平均心率分箱（近似，非逐秒区间）。
          </p>
        </div>

        <div className={styles.hrPanel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>强度比例</span>
            <span className={styles.panelHint}>近似 · 同一心率样本</span>
          </div>
          {hr.covered ? (
            <>
              <div
                className={styles.intensityBar}
                role="img"
                aria-label="强度比例"
              >
                {hr.levels.map((level) => (
                  <span
                    key={level.key}
                    className={styles.intensitySeg}
                    style={{
                      width: `${level.ratio * 100}%`,
                      background: `color-mix(in srgb, var(--accent) ${level.alpha}%, transparent)`,
                    }}
                    title={`${level.label} ${level.range} · ${formatNumber(
                      level.count
                    )} 次 · ${Math.round(level.ratio * 100)}%`}
                  />
                ))}
              </div>
              <div className={styles.levelGrid}>
                {hr.levels.map((level) => (
                  <div key={level.key} className={styles.levelItem}>
                    <span
                      className={styles.levelSwatch}
                      style={{
                        background: `color-mix(in srgb, var(--accent) ${level.alpha}%, transparent)`,
                      }}
                    />
                    <span className={styles.levelLabel}>
                      {level.label} {level.range}
                    </span>
                    <strong className={styles.levelPct}>
                      {Math.round(level.ratio * 100)}%
                    </strong>
                    <span className={styles.levelCount}>
                      {formatNumber(level.count)} 次
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.hrEmpty}>当前范围内没有心率记录</p>
          )}
          <p className={styles.note}>
            按单次平均心率近似划分：轻松 &lt;140、中等 140–159、高强度
            ≥160；仅统计有心率的记录，缺失值不计为 0。
          </p>
        </div>
      </div>
    </div>
  );
};

export default TrainingAnalysis;
