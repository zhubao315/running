import SectionHeader from './SectionHeader';
import {
  formatDistanceKm,
  formatDurationLong,
  formatNumber,
  formatPaceSeconds,
  type Totals,
} from '@/utils/runningStats';
import styles from './style.module.css';

interface ICoreMetricsProps {
  totals: Totals;
  scope: string;
}

const CoreMetrics = ({ totals, scope }: ICoreMetricsProps) => {
  const hasRuns = totals.count > 0;

  const items = [
    {
      label: '累计跑量',
      value: formatDistanceKm(totals.distanceKm),
      unit: 'km',
      sub: hasRuns
        ? `${formatNumber(totals.count)} 次 · 平均 ${formatDistanceKm(
            totals.averageDistanceKm
          )} km`
        : '当前范围没有记录',
    },
    {
      label: '累计时间',
      value: formatDurationLong(totals.seconds),
      unit: '',
      sub: hasRuns
        ? `平均每次 ${formatDurationLong(totals.averageSeconds)}`
        : '当前范围没有记录',
    },
    {
      label: '平均配速',
      value: formatPaceSeconds(totals.paceSecondsPerKm),
      unit: totals.paceSecondsPerKm ? '/km' : '',
      sub: hasRuns ? '总时长 ÷ 总里程 · 加权平均' : '当前范围没有记录',
    },
    {
      label: '跑步次数',
      value: formatNumber(totals.count),
      unit: '次',
      sub: hasRuns
        ? `${formatNumber(totals.activeDays)} 个跑步日`
        : '当前范围没有记录',
    },
  ];

  const hrCoverage = totals.count
    ? Math.round((totals.hrCount / totals.count) * 100)
    : 0;

  return (
    <section className={styles.core} aria-labelledby="core-title">
      <SectionHeader index="02" kicker="CORE METRICS" title="核心数据">
        <span className={styles.scopePill}>{scope}</span>
      </SectionHeader>

      <div className={styles.metricsGrid}>
        {items.map((item) => (
          <article key={item.label} className={styles.metricCard}>
            <span className={styles.metricLabel}>{item.label}</span>
            <p className={styles.metricValue}>
              {item.value}
              {item.unit ? (
                <span className={styles.metricUnit}>{item.unit}</span>
              ) : null}
            </p>
            <p className={styles.metricSub}>{item.sub}</p>
          </article>
        ))}
      </div>

      <p className={styles.metricNote}>
        设备未记录爬升，累计爬升不纳入指标。
        {totals.hrCount > 0
          ? ` 心率均值 ${Math.round(
              totals.hrAverage ?? 0
            )} bpm，仅覆盖 ${formatNumber(totals.hrCount)} / ${formatNumber(
              totals.count
            )} 次（${hrCoverage}%）。`
          : ' 当前范围没有心率记录。'}
      </p>
    </section>
  );
};

export default CoreMetrics;
