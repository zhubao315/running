import { useMemo, useState } from 'react';
import useActivities from '@/hooks/useActivities';
import {
  CHINESE_LOCATION_INFO_MESSAGE_FIRST,
  CHINESE_LOCATION_INFO_MESSAGE_SECOND,
  RUN_TITLES,
} from '@/utils/const';
import { Activity, convertMovingTime2Sec, formatPace } from '@/utils/utils';
import styles from './style.module.css';

interface IJourneyStatsProps {
  changeCity: (_city: string) => void;
  changeTitle: (_title: string) => void;
}

const PREVIEW_CITIES = 8;

interface RecordRow {
  label: string;
  value: string;
  date: string;
}

interface Records {
  pbRows: RecordRow[];
  prRows: RecordRow[];
}

const fmtDuration = (seconds: number): string => {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};

// 最快时间：用单次跑步的平均配速推算（Strava 口径），跑量不足该距离则不计。
const FAST_DISTANCES = [
  { label: '5 公里', meters: 5000 },
  { label: '10 公里', meters: 10000 },
  { label: RUN_TITLES.HALF_MARATHON_RUN_TITLE, meters: 21097.5 },
  { label: RUN_TITLES.FULL_MARATHON_RUN_TITLE, meters: 42195 },
];

// 一天里的顺序：清晨 → 午间 → 午后 → 傍晚 → 夜晚；alpha 越小颜色越暗。
const DAY_SEGMENTS = [
  { title: RUN_TITLES.MORNING_RUN_TITLE, label: '清晨', alpha: 95 },
  { title: RUN_TITLES.MIDDAY_RUN_TITLE, label: '午间', alpha: 76 },
  { title: RUN_TITLES.AFTERNOON_RUN_TITLE, label: '午后', alpha: 58 },
  { title: RUN_TITLES.EVENING_RUN_TITLE, label: '傍晚', alpha: 44 },
  { title: RUN_TITLES.NIGHT_RUN_TITLE, label: '夜晚', alpha: 32 },
];

const fmtKm = (meters: number) =>
  Math.round(meters / 1000).toLocaleString('en-US');

const JourneyStats = ({ changeCity, changeTitle }: IJourneyStatsProps) => {
  const { activities, years, countries, provinces, cities, runPeriod } =
    useActivities();
  const [expanded, setExpanded] = useState(false);

  const cityArr = useMemo(
    () => Object.entries(cities).sort((a, b) => b[1] - a[1]),
    [cities]
  );

  // 与 YearStat 的 Total 行同一套算法：只统计有配速/心率的记录，缺失不补零。
  let totalMeters = 0;
  let totalSeconds = 0;
  let hrSum = 0;
  let hrCount = 0;
  let streak = 0;
  activities.forEach((run) => {
    if (run.average_speed) {
      totalMeters += run.distance || 0;
      totalSeconds += (run.distance || 0) / run.average_speed;
    }
    if (run.average_heartrate) {
      hrSum += run.average_heartrate;
      hrCount += 1;
    }
    if (run.streak) streak = Math.max(streak, run.streak);
  });
  const avgPace = totalSeconds ? formatPace(totalMeters / totalSeconds) : null;
  const avgHR = hrCount ? Math.round(hrSum / hrCount) : null;

  const periods = DAY_SEGMENTS.map(({ title, label, alpha }) => ({
    title,
    label,
    alpha,
    count: runPeriod[title] || 0,
  })).filter((p) => p.count > 0);
  const periodTotal = periods.reduce((sum, p) => sum + p.count, 0);

  // 个人最佳 / 最快时间：全部由历史数据实时推算，缺失不计、绝不补零。
  const records = useMemo<Records>(() => {
    const empty: Records = { pbRows: [], prRows: [] };
    const runs = (activities as Activity[]).filter(
      (a) => a.type === 'Run' && a.distance > 0 && a.average_speed > 0
    );
    if (!runs.length) return empty;

    const dateOf = (a: Activity) => a.start_date_local.slice(0, 10);

    const far = runs.reduce((a, b) => (b.distance > a.distance ? b : a));
    const longest = runs.reduce((a, b) =>
      convertMovingTime2Sec(b.moving_time) > convertMovingTime2Sec(a.moving_time)
        ? b
        : a
    );
    const fastest = runs.reduce((a, b) =>
      b.average_speed > a.average_speed ? b : a
    );

    const pbRows: RecordRow[] = [
      {
        label: '最远距离',
        value: `${(far.distance / 1000).toFixed(2)} km`,
        date: dateOf(far),
      },
      {
        label: '最长时间',
        value: fmtDuration(convertMovingTime2Sec(longest.moving_time)),
        date: dateOf(longest),
      },
      {
        label: '最快速度',
        value: `${(fastest.average_speed * 3.6).toFixed(2)} km/h`,
        date: dateOf(fastest),
      },
      {
        label: '最快配速',
        value: formatPace(fastest.average_speed),
        date: dateOf(fastest),
      },
    ];

    const prRows: RecordRow[] = FAST_DISTANCES.map(({ label, meters }) => {
      const cands = runs.filter((a) => a.distance >= meters);
      if (!cands.length) return null;
      const best = cands.reduce((a, b) =>
        meters / b.average_speed < meters / a.average_speed ? b : a
      );
      return {
        label,
        value: fmtDuration(meters / best.average_speed),
        date: dateOf(best),
      };
    }).filter((r): r is RecordRow => r !== null);

    return { pbRows, prRows };
  }, [activities]);

  const races = [
    {
      title: RUN_TITLES.HALF_MARATHON_RUN_TITLE,
      label: '半马',
      count: runPeriod[RUN_TITLES.HALF_MARATHON_RUN_TITLE] || 0,
    },
    {
      title: RUN_TITLES.FULL_MARATHON_RUN_TITLE,
      label: '全马',
      count: runPeriod[RUN_TITLES.FULL_MARATHON_RUN_TITLE] || 0,
    },
  ].filter((r) => r.count > 0);

  const homeCity = cityArr[0];
  const maxMeters = homeCity ? homeCity[1] : 1;
  const shownCities = expanded ? cityArr : cityArr.slice(0, PREVIEW_CITIES);

  return (
    <section className={styles.journey} aria-label="Total Journey">
      <p className={styles.kicker}>Total Journey</p>
      <p className={styles.quote}>
        {CHINESE_LOCATION_INFO_MESSAGE_FIRST}
        <br />
        {CHINESE_LOCATION_INFO_MESSAGE_SECOND}
        <span className={styles.quoteEn}> — Yesterday you said tomorrow.</span>
      </p>

      <div className={styles.geoGrid}>
        <div className={styles.geoCell}>
          <span className={styles.geoValue}>{years.length}</span>
          <span className={styles.geoLabel}>年</span>
        </div>
        <div className={styles.geoCell}>
          <span className={styles.geoValue}>{countries.length}</span>
          <span className={styles.geoLabel}>国家</span>
        </div>
        <div className={styles.geoCell}>
          <span className={styles.geoValue}>{provinces.length}</span>
          <span className={styles.geoLabel}>省份</span>
        </div>
        <div className={styles.geoCell}>
          <span className={styles.geoValue}>{cityArr.length}</span>
          <span className={styles.geoLabel}>城市</span>
        </div>
        {homeCity ? (
          <button
            type="button"
            className={`${styles.geoCell} ${styles.homeCell}`}
            onClick={() => changeCity(homeCity[0])}
            title="点击在地图上查看主场足迹"
          >
            <span className={styles.geoValue}>{homeCity[0]}</span>
            <span className={styles.geoLabel}>
              {fmtKm(homeCity[1])} KM · 主场
            </span>
          </button>
        ) : null}
      </div>

      <div className={styles.body}>
        {cityArr.length ? (
          <div className={styles.cities}>
            <div className={styles.panelHead}>
              <span className={styles.panelTitle}>城市足迹</span>
              <span className={styles.panelHint}>
                点击城市，在地图上点亮它的轨迹
              </span>
            </div>
            <div
              className={`${styles.cityList} ${
                expanded ? styles.cityListExpanded : ''
              }`}
            >
              {shownCities.map(([name, meters], i) => (
                <button
                  key={name}
                  type="button"
                  className={styles.cityRow}
                  onClick={() => changeCity(name)}
                  title={`${name} · ${fmtKm(meters)} KM`}
                >
                  <span className={styles.cityName}>{name}</span>
                  <span className={styles.cityTrack}>
                    <span
                      className={styles.cityFill}
                      style={{
                        width: `${Math.max(
                          (meters / maxMeters) * 100,
                          0.6
                        )}%`,
                        background: `color-mix(in srgb, var(--accent) ${Math.round(
                          Math.max(
                            0.24,
                            0.95 - (i / Math.max(1, shownCities.length - 1)) * 0.7
                          ) * 100
                        )}%, transparent)`,
                      }}
                    />
                  </span>
                  <span className={styles.cityKm}>{fmtKm(meters)} KM</span>
                </button>
              ))}
            </div>
            {cityArr.length > PREVIEW_CITIES ? (
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? '收起' : `展开全部 ${cityArr.length} 城`}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className={styles.rhythm}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>时段节律</span>
            <span className={styles.panelHint}>{periodTotal} Runs</span>
          </div>
          {periodTotal ? (
            <div className={styles.periodBar} role="group" aria-label="时段分布">
              {periods.map((p, i) => (
                <button
                  key={p.title}
                  type="button"
                  className={`${styles.periodSeg} ${
                    i === 0 ? styles.segFirst : ''
                  } ${i === periods.length - 1 ? styles.segLast : ''}`}
                  style={{
                    flexGrow: p.count,
                    background: `color-mix(in srgb, var(--accent) ${p.alpha}%, transparent)`,
                  }}
                  onClick={() => changeTitle(p.title)}
                  title={`${p.label}跑步 · ${p.count} Runs`}
                  aria-label={`${p.label} ${p.count} 次`}
                />
              ))}
            </div>
          ) : null}
          <div className={styles.periodLegend}>
            {periods.map((p) => (
              <button
                key={p.title}
                type="button"
                className={styles.legendItem}
                onClick={() => changeTitle(p.title)}
              >
                <span
                  className={styles.legendDot}
                  style={{
                    background: `color-mix(in srgb, var(--accent) ${p.alpha}%, transparent)`,
                  }}
                />
                <span className={styles.legendName}>{p.label}</span>
                <span className={styles.legendCount}>{p.count}</span>
              </button>
            ))}
          </div>

          {races.length ? (
            <div className={styles.races}>
              {races.map((r) => (
                <button
                  key={r.title}
                  type="button"
                  className={styles.racePill}
                  onClick={() => changeTitle(r.title)}
                >
                  <span className={styles.raceLabel}>{r.label}</span>
                  <span className={styles.raceCount}>{r.count} Runs</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.extraKpis}>
            {avgPace ? (
              <div className={styles.kpi}>
                <span className={styles.kpiValue}>{avgPace}</span>
                <span className={styles.kpiLabel}>Avg Pace</span>
              </div>
            ) : null}
            {streak ? (
              <div className={styles.kpi}>
                <span className={styles.kpiValue}>{streak} day</span>
                <span className={styles.kpiLabel}>Streak</span>
              </div>
            ) : null}
            {avgHR ? (
              <div className={styles.kpi}>
                <span className={styles.kpiValue}>{avgHR}</span>
                <span className={styles.kpiLabel}>Avg Heart Rate</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {records.pbRows.length ? (
        <div className={styles.records}>
          <div className={styles.recordCard}>
            <div className={styles.panelHead}>
              <span className={styles.panelTitle}>个人最佳</span>
              <span className={styles.panelHint}>历史之最</span>
            </div>
            <div className={styles.recordList}>
              {records.pbRows.map((r) => (
                <div key={r.label} className={styles.recordRow}>
                  <span className={styles.recordLabel}>{r.label}</span>
                  <span className={styles.recordValue}>{r.value}</span>
                  <span className={styles.recordDate}>{r.date}</span>
                </div>
              ))}
            </div>
          </div>
          {records.prRows.length ? (
            <div className={styles.recordCard}>
              <div className={styles.panelHead}>
                <span className={styles.panelTitle}>最快时间</span>
                <span className={styles.panelHint}>按平均配速推算</span>
              </div>
              <div className={styles.recordList}>
                {records.prRows.map((r) => (
                  <div key={r.label} className={styles.recordRow}>
                    <span className={styles.recordLabel}>{r.label}</span>
                    <span className={styles.recordValue}>{r.value}</span>
                    <span className={styles.recordDate}>{r.date}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default JourneyStats;
