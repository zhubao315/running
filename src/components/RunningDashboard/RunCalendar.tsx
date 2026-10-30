import SectionHeader from './SectionHeader';
import {
  WEEKDAYS,
  calendarLevel,
  formatDistanceKm,
  formatMonthCN,
  formatNumber,
  type CalendarYear,
} from '@/utils/runningStats';
import styles from './style.module.css';

interface IRunCalendarProps {
  calendar: CalendarYear;
  selectedMonth: number | null;
  selectedDate: string | null;
  minYear: number;
  maxYear: number;
  onSelectMonth: (_year: number, _month: number) => void;
  onSelectDate: (_date: string) => void;
  onSelectYear: (_year: string) => void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const RunCalendar = ({
  calendar,
  selectedMonth,
  selectedDate,
  minYear,
  maxYear,
  onSelectMonth,
  onSelectDate,
  onSelectYear,
}: IRunCalendarProps) => {
  const today = todayString();
  const canPrev = calendar.year > minYear;
  const canNext = calendar.year < maxYear;

  return (
    <section className={styles.section} aria-labelledby="calendar-title">
      <SectionHeader index="04" kicker="RUNNING CALENDAR" title="跑步日历">
        <div className={styles.yearNav}>
          <button
            type="button"
            className={styles.yearNavButton}
            onClick={() => onSelectYear(String(calendar.year - 1))}
            disabled={!canPrev}
            aria-label="上一年"
          >
            ‹
          </button>
          <span className={styles.yearNavLabel}>
            {calendar.year}
            <span>年</span>
          </span>
          <button
            type="button"
            className={styles.yearNavButton}
            onClick={() => onSelectYear(String(calendar.year + 1))}
            disabled={!canNext}
            aria-label="下一年"
          >
            ›
          </button>
          <button
            type="button"
            className={`${styles.yearAllButton} ${
              selectedMonth || selectedDate ? styles.yearAllButtonActive : ''
            }`}
            onClick={() => onSelectYear(String(calendar.year))}
          >
            全年
          </button>
        </div>
      </SectionHeader>

      <div className={styles.calendarMeta}>
        <span>
          {formatNumber(calendar.totals.count)} 次 ·{' '}
          {formatDistanceKm(calendar.totals.distanceKm)} km
        </span>
        <span className={styles.calendarHint}>
          按当日总里程着色 · 圆点表示一天多次
        </span>
      </div>

      <div className={styles.months}>
        {calendar.months.map((month) => {
          const isActive = selectedMonth === month.month;
          return (
            <div
              key={month.month}
              className={`${styles.month} ${
                isActive ? styles.monthActive : ''
              }`}
            >
              <button
                type="button"
                className={styles.monthHead}
                onClick={() => onSelectMonth(calendar.year, month.month)}
                aria-pressed={isActive}
                title={`${formatMonthCN(month.month)} · ${formatNumber(
                  month.count
                )} 次 · ${formatDistanceKm(month.distanceKm)} km`}
              >
                <span className={styles.monthName}>
                  {formatMonthCN(month.month)}
                </span>
                <span className={styles.monthMeta}>
                  {month.count
                    ? `${formatDistanceKm(month.distanceKm)} km`
                    : '无记录'}
                </span>
              </button>

              <div className={styles.weekdays} aria-hidden="true">
                {WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>

              <div className={styles.days}>
                {month.cells.map((cell, index) => {
                  if (!cell) {
                    return (
                      <span
                        key={`blank-${index}`}
                        className={styles.dayBlank}
                        aria-hidden="true"
                      />
                    );
                  }
                  if (!cell.count) {
                    return (
                      <span
                        key={cell.date}
                        className={`${styles.day} ${styles.dayEmpty}`}
                        title={`${cell.date} · 无记录`}
                      >
                        {cell.day}
                      </span>
                    );
                  }
                  const selected = selectedDate === cell.date;
                  const level = calendarLevel(cell.distanceKm);
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      className={`${styles.day} ${styles[`dayLevel${level}`]} ${
                        selected ? styles.daySelected : ''
                      } ${cell.date === today ? styles.dayToday : ''}`}
                      onClick={() => onSelectDate(cell.date)}
                      aria-pressed={selected}
                      aria-label={`${cell.date}，${formatDistanceKm(
                        cell.distanceKm
                      )} 公里，${cell.count} 次`}
                      title={`${cell.date} · ${formatDistanceKm(
                        cell.distanceKm
                      )} km · ${cell.count} 次`}
                    >
                      {cell.day}
                      {cell.count > 1 ? (
                        <i className={styles.multiDot} aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.legend}>
        <span className={styles.legendLabel}>少</span>
        <span className={`${styles.legendSwatch} ${styles.dayLevel1}`} />
        <span className={`${styles.legendSwatch} ${styles.dayLevel2}`} />
        <span className={`${styles.legendSwatch} ${styles.dayLevel3}`} />
        <span className={`${styles.legendSwatch} ${styles.dayLevel4}`} />
        <span className={`${styles.legendSwatch} ${styles.dayLevel5}`} />
        <span className={styles.legendLabel}>多</span>
        <span className={`${styles.legendSwatch} ${styles.legendEmpty}`} />
        <span className={styles.legendLabel}>无记录</span>
      </div>
    </section>
  );
};

export default RunCalendar;
