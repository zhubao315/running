/**
 * The page is a dashboard, but the thing people actually want to share is a
 * link to one record: the day a run happened, a year in review, one activity
 * with its 3D terrain. The address bar therefore follows the view:
 *
 *   ?date=YYYY-MM-DD   the day that is open in the calendar
 *   ?year=YYYY        the year in review
 *   ?run_id=…         the selected activity
 *
 * Writing the state replaces the history entry (never pushes one), so the
 * back button still leaves the site instead of walking through every click.
 */

export type UrlState = {
  date: string | null;
  year: string | null;
  runId: number | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{4}$/;

export const readUrlState = (): UrlState => {
  if (typeof window === 'undefined') {
    return { date: null, year: null, runId: null };
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date');
    const year = params.get('year');
    const runId = params.get('run_id');
    return {
      date: date && DATE.test(date) ? date : null,
      year: year && YEAR.test(year) ? year : null,
      runId: runId && /^\d+$/.test(runId) ? Number(runId) : null,
    };
  } catch (error) {
    return { date: null, year: null, runId: null };
  }
};

export const writeUrlState = (state: {
  date?: string | null;
  year?: string | null;
  runId?: number | null;
}): void => {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    const set = (key: string, value: string | null | undefined) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    set('date', state.date);
    set('year', state.year);
    set(
      'run_id',
      state.runId === null || state.runId === undefined
        ? null
        : String(state.runId)
    );
    window.history.replaceState({}, '', url.toString());
  } catch (error) {
    // A blocked history API must never break the page.
  }
};

/** The health dashboard, which holds the sleep and recovery side of the same day. */
export const HEALTH_SITE_URL = 'https://zhubao315.github.io/health/';

/** A link to the health dashboard, pinned to one day. */
export const healthDayUrl = (date: string): string =>
  `${HEALTH_SITE_URL}?date=${encodeURIComponent(date)}`;
