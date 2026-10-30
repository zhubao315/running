import type { KeyboardEvent } from 'react';
import {
  formatPace,
  titleForRun,
  formatRunTime,
  Activity,
} from '@/utils/utils';
import { sceneHashOf } from '@/vert/scenes';
import styles from './style.module.css';

interface IRunRowProperties {
  run: Activity;
  selected: boolean;
  onSelect: (_runId: number | null) => void;
}

const RunRow = ({ run, selected, onSelect }: IRunRowProperties) => {
  const distance = (run.distance / 1000.0).toFixed(2);
  const pace = run.average_speed > 0 ? formatPace(run.average_speed) : '—';
  const heartRate = run.average_heartrate
    ? Math.round(run.average_heartrate)
    : null;
  const runTime = formatRunTime(run.moving_time);
  const handleClick = () => onSelect(selected ? null : run.run_id);
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <tr
      className={`${styles.runRow} ${selected ? styles.selected : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-selected={selected}
    >
      <td>
        {titleForRun(run)}
        {sceneHashOf(run.run_id) ? (
          <sup
            title="查看 3D 地形"
            className={styles.badge3d}
          >
            3D
          </sup>
        ) : null}
      </td>
      <td>{distance}</td>
      <td>{pace}</td>
      <td title={heartRate === null ? '无心率数据' : undefined}>
        {heartRate ?? '—'}
      </td>
      <td>{runTime}</td>
      <td className={styles.runDate}>
        {run.start_date_local.slice(0, 10)}
        <span className={styles.runClock}>
          {run.start_date_local.slice(11, 16)}
        </span>
      </td>
    </tr>
  );
};

export default RunRow;
