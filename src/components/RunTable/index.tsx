import { useEffect, useMemo, useState } from 'react';
import {
  convertMovingTime2Sec,
  Activity,
} from '@/utils/utils';
import RunRow from './RunRow';
import styles from './style.module.css';

interface IRunTableProperties {
  runs: Activity[];
  selectedRunId: number | null;
  onSelectRun: (_runId: number | null) => void;
  onClearScope: () => void;
}

type SortKey = 'date' | 'distance' | 'pace' | 'heartrate' | 'time';
type SortDirection = 'asc' | 'desc';

interface ISortState {
  key: SortKey;
  direction: SortDirection;
}

const PAGE_SIZE = 80;
const COMPACT_PAGE_SIZE = 24;
const COMPACT_QUERY = '(max-width: 700px)';

const pageSizeForViewport = (): number =>
  typeof window !== 'undefined' &&
  window.matchMedia(COMPACT_QUERY).matches
    ? COMPACT_PAGE_SIZE
    : PAGE_SIZE;

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  initialDirection: SortDirection;
}> = [
  { key: 'distance', label: 'KM', initialDirection: 'desc' },
  { key: 'pace', label: 'Pace', initialDirection: 'asc' },
  { key: 'heartrate', label: 'BPM', initialDirection: 'desc' },
  { key: 'time', label: 'Time', initialDirection: 'desc' },
  { key: 'date', label: 'Date', initialDirection: 'desc' },
];

const sortValue = (run: Activity, key: SortKey): number | null => {
  switch (key) {
    case 'date':
      return new Date(run.start_date_local.replace(' ', 'T')).getTime();
    case 'distance':
      return run.distance;
    case 'pace':
      return run.average_speed > 0 ? 1000 / run.average_speed : null;
    case 'heartrate':
      return run.average_heartrate ?? null;
    case 'time':
      return convertMovingTime2Sec(run.moving_time);
  }
};

const RunTable = ({
  runs,
  selectedRunId,
  onSelectRun,
  onClearScope,
}: IRunTableProperties) => {
  const [sort, setSort] = useState<ISortState>({
    key: 'date',
    direction: 'desc',
  });
  const [pageSize, setPageSize] = useState(pageSizeForViewport);
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(COMPACT_QUERY);
    const handleChange = () => {
      const next = query.matches ? COMPACT_PAGE_SIZE : PAGE_SIZE;
      setPageSize(next);
      setVisibleCount(next);
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const sortedRuns = useMemo(() => {
    const sorted = [...runs].sort((a, b) => {
      const aValue = sortValue(a, sort.key);
      const bValue = sortValue(b, sort.key);
      if (aValue === null && bValue === null) return a.run_id - b.run_id;
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      if (aValue === bValue) return a.run_id - b.run_id;
      return sort.direction === 'asc' ? aValue - bValue : bValue - aValue;
    });
    return sorted;
  }, [runs, sort]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [runs, sort, pageSize]);

  const shownRuns = sortedRuns.slice(0, visibleCount);
  const hasMore = visibleCount < sortedRuns.length;

  const handleSort = (key: SortKey, initialDirection: SortDirection) => {
    setSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === 'asc' ? 'desc' : 'asc',
          }
        : { key, direction: initialDirection }
    );
    onSelectRun(null);
  };

  if (!runs.length) {
    return (
      <div className={styles.empty}>
        <p>当前筛选没有跑步记录。</p>
        <button type="button" onClick={onClearScope}>
          清除筛选，回到全部历史
        </button>
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      <p className={styles.hint}>
        <span className={styles.hintBadge}>3D</span>
        标记的跑步可查看地形；点击行在地图上定位
      </p>

      <table className={styles.runTable} cellSpacing="0" cellPadding="0">
        <thead>
          <tr>
            <th>活动</th>
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              return (
                <th
                  key={column.key}
                  aria-sort={
                    active
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className={`${styles.sortButton} ${
                      active ? styles.sortActive : ''
                    }`}
                    onClick={() =>
                      handleSort(column.key, column.initialDirection)
                    }
                  >
                    {column.label}
                    <span className={styles.sortIcon} aria-hidden="true">
                      {active ? (sort.direction === 'asc' ? '↑' : '↓') : '·'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shownRuns.map((run) => (
            <RunRow
              key={run.run_id}
              run={run}
              selected={selectedRunId === run.run_id}
              onSelect={onSelectRun}
            />
          ))}
        </tbody>
      </table>

      <div className={styles.tableFooter}>
        <span>
          显示 {Math.min(visibleCount, sortedRuns.length)} /{' '}
          {sortedRuns.length} 条
        </span>
        {hasMore ? (
          <button
            type="button"
            className={styles.loadMore}
            onClick={() => setVisibleCount((count) => count + pageSize)}
          >
            加载更多 {Math.min(pageSize, sortedRuns.length - visibleCount)} 条
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default RunTable;
