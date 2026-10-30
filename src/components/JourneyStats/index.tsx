import { useMemo, useState } from 'react';
import useActivities from '@/hooks/useActivities';
import { RUN_TITLES } from '@/utils/const';
import { Activity, convertMovingTime2Sec, formatPace } from '@/utils/utils';
import SectionHeader from '@/components/RunningDashboard/SectionHeader';
import styles from './style.module.css';

interface IJourneyStatsProps {
  changeCity: (_city: string) => void;
  changeTitle: (_title: string) => void;
  onViewRun: (_runId: number) => void;
}

const PREVIEW_CITIES = 8;

interface RecordItem {
  label: string;
  value: string;
  date: string;
  run: Activity;
}

interface Records {
  pbRows: RecordItem[];
  prRows: RecordItem[];
}

const FAST_DISTANCES = [
  { label: '5K', zh: '5 公里', meters: 5000 },
  { label: '10K', zh: '10 公里', meters: 10000 },
  { label: 'Half Marathon', zh: '半程马拉松', meters: 21097.5 },
  { label: 'Full Marathon', zh: '全程马拉松', meters: 42195 },
];

const DAY_SEGMENTS = [
  { title: RUN_TITLES.MORNING_RUN_TITLE, label: '清晨', alpha: 95 },
  { title: RUN_TITLES.MIDDAY_RUN_TITLE, label: '午间', alpha: 76 },
  { title: RUN_TITLES.AFTERNOON_RUN_TITLE, label: '午后', alpha: 58 },
  { title: RUN_TITLES.EVENING_RUN_TITLE, label: '傍晚', alpha: 44 },
  { title: RUN_TITLES.NIGHT_RUN_TITLE, label: '夜晚', alpha: 32 },
];

const fmtDuration = (seconds: number): string => {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
};

const fmtKm = (meters: number) =>
  Math.round(meters / 1000).toLocaleString('en-US');

const JourneyStats = ({ changeCity, changeTitle, onViewRun }: IJourneyStatsProps) => {
  const { activities, years, countries, provinces, cities, runPeriod } =
    useActivities();
  const [expanded, setExpanded] = useState(false);
  const [selectedPb, setSelectedPb] = useState<RecordItem | null>(null);
  const [selectedFastDistance, setSelectedFastDistance] = useState<number | null>(
    null
  );

  const cityArr = useMemo(
    () => Object.entries(cities).sort((a, b) => b[1] - a[1]),
    [cities]
  );

  const validRuns = useMemo(
    () =>
      (activities as Activity[]).filter(
        (a) => a.type === 'Run' && a.distance > 0 && a.average_speed > 0
      ),
    [activities]
  );

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

  const records = useMemo<Records>(() => {
    const empty: Records = { pbRows: [], prRows: [] };
    if (!validRuns.length) return empty;

    const dateOf = (a: Activity) => a.start_date_local.slice(0, 10);

    const realLong = validRuns.filter(
      (a) =>
        a.average_speed >= 6 / 3.6 ||
        convertMovingTime2Sec(a.moving_time) <= 2 * 3600
    );
    const far = validRuns.reduce((a, b) => (b.distance > a.distance ? b : a));
    const longest = (realLong.length ? realLong : validRuns).reduce((a, b) =>
      convertMovingTime2Sec(b.moving_time) > convertMovingTime2Sec(a.moving_time)
        ? b
        : a
    );
    const fastest = validRuns.reduce((a, b) =>
      b.average_speed > a.average_speed ? b : a
    );

    const pbRows: RecordItem[] = [
      {
        label: '最长距离 / Longest Distance',
        value: `${(far.distance / 1000).toFixed(2)} km`,
        date: dateOf(far),
        run: far,
      },
      {
        label: '最长时间 / Longest Time',
        value: fmtDuration(convertMovingTime2Sec(longest.moving_time)),
        date: dateOf(longest),
        run: longest,
      },
      {
        label: '最快速度 / Fastest Speed',
        value: `${(fastest.average_speed * 3.6).toFixed(2)} km/h`,
        date: dateOf(fastest),
        run: fastest,
      },
      {
        label: '最快配速 / Fastest Pace',
        value: formatPace(fastest.average_speed),
        date: dateOf(fastest),
        run: fastest,
      },
    ];

    const prRows: RecordItem[] = FAST_DISTANCES.map(({ label, meters }) => {
      const cands = validRuns.filter((a) => a.distance >= meters);
      if (!cands.length) return null;
      const best = cands.reduce((a, b) =>
        meters / b.average_speed < meters / a.average_speed ? b : a
      );
      return {
        label: `${label} / ${FAST_DISTANCES.find((d) => d.meters === meters)?.zh}`,
        value: fmtDuration(meters / best.average_speed),
        date: dateOf(best),
        run: best,
      };
    }).filter((r): r is RecordItem => r !== null);

    return { pbRows, prRows };
  }, [validRuns]);

  const fastCandidates = useMemo(() => {
    if (selectedFastDistance === null) return [];
    return validRuns
      .filter((a) => a.distance >= selectedFastDistance)
      .map((a) => ({
        run: a,
        estimated: selectedFastDistance / a.average_speed,
      }))
      .sort((a, b) => a.estimated - b.estimated);
  }, [selectedFastDistance, validRuns]);

  const races = [
    {
      title: RUN_TITLES.HALF_MARATHON_RUN_TITLE,
      label: 'Half Marathon / 半程马拉松',
      count: runPeriod[RUN_TITLES.HALF_MARATHON_RUN_TITLE] || 0,
    },
    {
      title: RUN_TITLES.FULL_MARATHON_RUN_TITLE,
      label: 'Full Marathon / 全程马拉松',
      count: runPeriod[RUN_TITLES.FULL_MARATHON_RUN_TITLE] || 0,
    },
  ].filter((r) => r.count > 0);

  const homeCity = cityArr[0];
  const maxMeters = homeCity ? homeCity[1] : 1;
  const shownCities = expanded ? cityArr : cityArr.slice(0, PREVIEW_CITIES);

  const selectedFastMeta = FAST_DISTANCES.find(
    (d) => d.meters === selectedFastDistance
  );

  const detailHeartRate = selectedPb?.run.average_heartrate
    ? Math.round(selectedPb.run.average_heartrate)
    : null;

  return (
    <section className={styles.journey} aria-label="Total Journey">
      <SectionHeader index="04" kicker="TOTAL JOURNEY" title="跑步旅程" />

      <div className={styles.geoGrid}>
        <div className={styles.geoCell}>
          <span className={styles.geoValue}>{years.length}</span>
          <span className={styles.geoLabel}>Years / 年</span>
        </div>
        <div className={styles.geoCell}>
          <span className={styles.geoValue}>{countries.length}</span>
          <span className={styles.geoLabel}>Countries / 国家</span>
        </div>
        <div className={styles.geoCell}>
          <span className={styles.geoValue}>{provinces.length}</span>
          <span className={styles.geoLabel}>Provinces / 省份</span>
        </div>
        <div className={styles.geoCell}>
          <span className={styles.geoValue}>{cityArr.length}</span>
          <span className={styles.geoLabel}>Cities / 城市</span>
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
              {fmtKm(homeCity[1])} KM · Home / 主场
            </span>
          </button>
        ) : null}
      </div>

      <div className={styles.body}>
        {cityArr.length ? (
          <div className={styles.cities}>
            <div className={styles.panelHead}>
              <span className={styles.panelTitle}>
                Geographic Footprint / 城市足迹
              </span>
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
            <span className={styles.panelTitle}>
              Running Rhythm / 跑步节律
            </span>
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
                <span className={styles.kpiLabel}>
                  Average Pace / 平均配速
                </span>
              </div>
            ) : null}
            {streak ? (
              <div className={styles.kpi}>
                <span className={styles.kpiValue}>{streak} day</span>
                <span className={styles.kpiLabel}>
                  Longest Streak / 最长连续跑步
                </span>
              </div>
            ) : null}
            {avgHR ? (
              <div className={styles.kpi}>
                <span className={styles.kpiValue}>{avgHR}</span>
                <span className={styles.kpiLabel}>
                  Avg Heart Rate / 平均心率
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {records.pbRows.length ? (
        <div className={styles.records}>
          <div className={styles.recordCard}>
            <div className={styles.panelHead}>
              <span className={styles.panelTitle}>
                Personal Bests / 个人最佳
              </span>
              <span className={styles.panelHint}>
                历史之最 · 点击纪录查看活动
              </span>
            </div>
            <div className={styles.recordList}>
              {records.pbRows.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  className={styles.recordRowButton}
                  onClick={() =>
                    setSelectedPb((current) =>
                      current?.run.run_id === r.run.run_id &&
                      current?.label === r.label
                        ? null
                        : r
                    )
                  }
                  aria-pressed={
                    selectedPb?.label === r.label &&
                    selectedPb?.run.run_id === r.run.run_id
                  }
                >
                  <span className={styles.recordLabel}>{r.label}</span>
                  <span className={styles.recordValue}>{r.value}</span>
                  <span className={styles.recordDate}>{r.date}</span>
                </button>
              ))}
            </div>
          </div>
          {records.prRows.length ? (
            <div className={styles.recordCard}>
              <div className={styles.panelHead}>
                <span className={styles.panelTitle}>
                  Fastest Times / 最快时间
                </span>
                <span className={styles.panelHint}>
                  基于单次活动平均配速估算
                </span>
              </div>
              <div className={styles.fastButtons}>
                {FAST_DISTANCES.map((d) => (
                  <button
                    key={d.meters}
                    type="button"
                    className={`${styles.fastButton} ${
                      selectedFastDistance === d.meters
                        ? styles.fastButtonActive
                        : ''
                    }`}
                    onClick={() =>
                      setSelectedFastDistance((current) =>
                        current === d.meters ? null : d.meters
                      )
                    }
                    aria-pressed={selectedFastDistance === d.meters}
                  >
                    <span className={styles.fastButtonLabel}>{d.label}</span>
                    <span className={styles.fastButtonZh}>{d.zh}</span>
                  </button>
                ))}
              </div>
              {selectedFastDistance !== null ? (
                fastCandidates.length ? (
                  <div className={styles.candidateList}>
                    {fastCandidates.map((item, index) => (
                      <button
                        key={item.run.run_id}
                        type="button"
                        className={`${styles.candidateRow} ${
                          index === 0 ? styles.candidateFirst : ''
                        }`}
                        onClick={() =>
                          setSelectedPb({
                            label: `${selectedFastMeta?.label} 估算时间`,
                            value: fmtDuration(item.estimated),
                            date: item.run.start_date_local.slice(0, 10),
                            run: item.run,
                          })
                        }
                      >
                        <span className={styles.candidateRank}>
                          {index === 0 ? '最快' : `#${index + 1}`}
                        </span>
                        <span className={styles.candidateDate}>
                          {item.run.start_date_local.slice(0, 10)}
                        </span>
                        <span className={styles.candidateDistance}>
                          {(item.run.distance / 1000).toFixed(2)} km
                        </span>
                        <span className={styles.candidatePace}>
                          {formatPace(item.run.average_speed)}
                        </span>
                        <span className={styles.candidateEstimate}>
                          {fmtDuration(item.estimated)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyState}>
                    没有满足该距离条件的历史活动。
                  </p>
                )
              ) : (
                <p className={styles.fastHint}>
                  点击距离查看符合条件的历史活动；点击活动可查看详情与地图轨迹。
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedPb ? (
        <div className={styles.detailCard}>
          <div className={styles.detailHead}>
            <span className={styles.detailTitle}>{selectedPb.label}</span>
            <button
              type="button"
              className={styles.detailClose}
              onClick={() => setSelectedPb(null)}
            >
              返回列表
            </button>
          </div>
          <p className={styles.detailValue}>{selectedPb.value}</p>
          <dl className={styles.detailGrid}>
            <div>
              <dt>日期 / Date</dt>
              <dd>{selectedPb.run.start_date_local.slice(0, 10)}</dd>
            </div>
            <div>
              <dt>距离 / Distance</dt>
              <dd>{(selectedPb.run.distance / 1000).toFixed(2)} km</dd>
            </div>
            <div>
              <dt>时长 / Duration</dt>
              <dd>{fmtDuration(convertMovingTime2Sec(selectedPb.run.moving_time))}</dd>
            </div>
            <div>
              <dt>配速 / Pace</dt>
              <dd>{formatPace(selectedPb.run.average_speed)}</dd>
            </div>
            <div>
              <dt>心率 / Heart Rate</dt>
              <dd>
                {selectedPb.run.average_heartrate
                  ? `${Math.round(selectedPb.run.average_heartrate)} bpm`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>类型 / Type</dt>
              <dd>{selectedPb.run.subtype || selectedPb.run.type}</dd>
            </div>
          </dl>
          <button
            type="button"
            className={styles.detailMapButton}
            onClick={() => onViewRun(selectedPb.run.run_id)}
          >
            在地图中查看轨迹 / View on map
          </button>
          <p className={styles.detailNote}>
            基于单次历史活动的平均配速估算，仅用于个人训练表现参考，不代表官方比赛成绩。
          </p>
        </div>
      ) : null}
    </section>
  );
};

export default JourneyStats;
