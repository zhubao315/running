import {
  computeTotals,
  formatDateCN,
  formatDistanceKm,
  formatDurationLong,
  formatPaceSeconds,
  formatRunClock,
  weekdayCN,
  type RunRecord,
} from '@/utils/runningStats';
import { titleForRun } from '@/utils/utils';
import { sceneHashOf } from '@/vert/scenes';
import styles from './style.module.css';

interface IDayDetailProps {
  date: string;
  runs: RunRecord[];
  selectedRunId: number | null;
  onSelectRun: (_runId: number) => void;
  onClose: () => void;
}

const DayDetail = ({
  date,
  runs,
  selectedRunId,
  onSelectRun,
  onClose,
}: IDayDetailProps) => {
  const totals = computeTotals(runs);
  const ordered = [...runs].sort((a, b) =>
    a.start_date_local.localeCompare(b.start_date_local)
  );

  return (
    <article className={styles.dayDetail} aria-labelledby="day-detail-title">
      <header className={styles.dayDetailHead}>
        <div>
          <p className={styles.dayKicker}>
            {weekdayCN(date)} · {totals.count} 次跑步
          </p>
          <h3 id="day-detail-title" className={styles.dayTitle}>
            {formatDateCN(date)}
          </h3>
        </div>
        <div className={styles.dayTotals}>
          <span>
            <strong>{formatDistanceKm(totals.distanceKm)}</strong> km
          </span>
          <span>
            <strong>{formatDurationLong(totals.seconds)}</strong>
          </span>
          <span>
            <strong>{formatPaceSeconds(totals.paceSecondsPerKm)}</strong>/km
          </span>
        </div>
        <button
          type="button"
          className={styles.dayClose}
          onClick={onClose}
          aria-label="收起当日详情"
        >
          收起
        </button>
      </header>

      <ul className={styles.dayRuns}>
        {ordered.map((run) => {
          const selected = selectedRunId === run.run_id;
          return (
            <li key={run.run_id}>
              <button
                type="button"
                className={`${styles.dayRun} ${
                  selected ? styles.dayRunSelected : ''
                }`}
                onClick={() => onSelectRun(run.run_id)}
                aria-pressed={selected}
              >
                <span className={styles.runTime}>
                  {run.start_date_local.slice(11, 16)}
                </span>
                <span className={styles.runName}>{titleForRun(run)}</span>
                <span className={styles.runStat}>
                  {formatDistanceKm(run.distanceKm)} km
                </span>
                <span className={styles.runStat}>
                  {formatPaceSeconds(run.paceSecondsPerKm)}/km
                </span>
                <span className={styles.runStat}>
                  {run.average_heartrate
                    ? `${Math.round(run.average_heartrate)} bpm`
                    : '— bpm'}
                </span>
                <span className={styles.runStat}>
                  {formatRunClock(run.seconds)}
                </span>
                {sceneHashOf(run.run_id) ? (
                  <span className={styles.badge3d}>3D</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <p className={styles.dayHint}>
        点击记录在地图上定位，带 3D 标记的记录可展开地形。
      </p>
    </article>
  );
};

export default DayDetail;
