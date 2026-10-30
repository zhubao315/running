import { useState } from 'react';
import {
  formatDistanceKm,
  formatDurationLong,
  formatMetric,
  formatNumber,
  formatPaceSeconds,
  metricNumber,
  type MetricKey,
  type YearPoint,
} from '@/utils/runningStats';
import styles from './style.module.css';

interface ITrendChartProps {
  series: YearPoint[];
  metric: MetricKey;
  selectedYear: string;
  onSelectYear: (_year: string) => void;
}

const axisLabel = (metric: MetricKey, value: number): string => {
  switch (metric) {
    case 'distance':
      return formatNumber(Math.round(value));
    case 'count':
      return formatNumber(Math.round(value));
    case 'duration':
      return `${formatNumber(Math.round(value / 3600))}h`;
    case 'pace':
      return formatPaceSeconds(value);
  }
};

const TrendChart = ({
  series,
  metric,
  selectedYear,
  onSelectYear,
}: ITrendChartProps) => {
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  if (!series.length) {
    return <p className={styles.chartEmpty}>暂无年度数据</p>;
  }

  const values = series.map((point) => metricNumber(point, metric));
  const defined = values.filter((value): value is number => value !== null);
  const isPace = metric === 'pace';
  const max = defined.length ? Math.max(...defined) : 0;
  const paceMin = isPace && defined.length ? Math.min(...defined) : 0;
  const paceMax = isPace && defined.length ? Math.max(...defined) : 1;
  const paceSpan = paceMax - paceMin || 1;

  const percent = (value: number | null): number | null => {
    if (value === null) return null;
    if (isPace) return ((paceMax - value) / paceSpan) * 100;
    return max > 0 ? (value / max) * 100 : 0;
  };

  const ticks = [0, 1 / 3, 2 / 3, 1].map((step) => ({
    pct: step * 100,
    label: axisLabel(
      metric,
      isPace ? paceMax - paceSpan * step : max * step
    ),
  }));

  const activeYear =
    hoverYear ??
    (selectedYear !== 'all'
      ? Number(selectedYear)
      : series[series.length - 1].year);
  const activePoint =
    series.find((point) => point.year === activeYear) ??
    series[series.length - 1];

  const paceSegments: string[] = [];
  let segment: string[] = [];
  series.forEach((point, index) => {
    const value = metricNumber(point, metric);
    if (value === null || !point.count) {
      if (segment.length) {
        paceSegments.push(segment.join(' '));
        segment = [];
      }
      return;
    }
    const pct = percent(value) ?? 0;
    segment.push(
      `${((index + 0.5) / series.length) * 100},${100 - pct}`
    );
  });
  if (segment.length) paceSegments.push(segment.join(' '));

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartReadout} aria-live="polite">
        <span className={styles.readoutYear}>{activePoint.year} 年</span>
        {activePoint.count ? (
          <>
            <strong className={styles.readoutValue}>
              {formatMetric(activePoint, metric)}
            </strong>
            <span className={styles.readoutMeta}>
              {formatNumber(activePoint.count)} 次 ·{' '}
              {formatDistanceKm(activePoint.distanceKm)} km ·{' '}
              {formatDurationLong(activePoint.seconds)}
            </span>
          </>
        ) : (
          <span className={styles.readoutMeta}>这一年没有跑步记录</span>
        )}
      </div>

      <div className={styles.chart}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.pct}
              className={styles.yTick}
              style={{ bottom: `${tick.pct}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div className={styles.plotMain}>
          <div className={styles.gridLines} aria-hidden="true">
            {ticks.map((tick) => (
              <i
                key={tick.pct}
                className={styles.gridLine}
                style={{ bottom: `${tick.pct}%` }}
              />
            ))}
          </div>

          {isPace ? (
            <svg
              className={styles.paceLines}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {paceSegments.map((points) => (
                <polyline
                  key={points}
                  points={points}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          ) : null}

          <div
            className={styles.columns}
            style={{
              gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))`,
            }}
          >
            {series.map((point, index) => {
              const value = values[index];
              const pct = percent(value);
              const selected = selectedYear === String(point.year);
              const empty = !point.count || value === null;
              return (
                <button
                  key={point.year}
                  type="button"
                  className={`${styles.column} ${
                    selected ? styles.columnSelected : ''
                  } ${empty ? styles.columnEmpty : ''}`}
                  onClick={() => onSelectYear(String(point.year))}
                  onMouseEnter={() => setHoverYear(point.year)}
                  onMouseLeave={() => setHoverYear(null)}
                  onFocus={() => setHoverYear(point.year)}
                  onBlur={() => setHoverYear(null)}
                  aria-pressed={selected}
                  aria-label={`${point.year} 年，${formatMetric(point, metric)}`}
                  title={`${point.year} · ${formatMetric(point, metric)}`}
                >
                  <span className={styles.barSlot}>
                    {isPace ? (
                      pct === null ? (
                        <span className={styles.emptyDot}>–</span>
                      ) : (
                        <span
                          className={styles.paceDot}
                          style={{ bottom: `${pct}%` }}
                        />
                      )
                    ) : pct !== null && pct > 0 ? (
                      <span
                        className={styles.bar}
                        style={{ height: `${Math.max(pct, 1.5)}%` }}
                      />
                    ) : (
                      <span className={styles.zeroBar} />
                    )}
                  </span>
                  <span className={styles.yearLabel}>
                    <span className={styles.yearFull}>{point.year}</span>
                    <span className={styles.yearShort}>
                      {String(point.year).slice(2)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrendChart;
