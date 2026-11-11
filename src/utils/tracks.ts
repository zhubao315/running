/**
 * GPS geometry arrives per year, only when a map is about to draw it.
 *
 * src/static/activities.json is split at build time by
 * plugins/splitActivities.ts: the records ship without `summary_polyline`
 * (plus a `has_track` flag, so a record can still say it has geometry) and the
 * polylines land in `data/tracks/tracks-<year>.json`. This module is the
 * runtime half of that deal — fetch a year once, keep it for the session, and
 * let the map re-render when new geometry arrives.
 *
 * Nothing here is optional in the display sense: if a year fails to load the
 * map says so instead of drawing a smaller area and calling it the data.
 */

type TrackEntry = {
  run_id: number;
  summary_polyline: string;
};

type TrackLike = {
  run_id: number;
  start_date_local?: string;
  summary_polyline?: string | null;
  has_track?: boolean;
  year?: number;
};

const polylines = new Map<number, string>();
const loadedBuckets = new Set<string>();
const failures = new Map<string, string>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

export const bucketForRun = (run: TrackLike): string => {
  const year = String(run.year ?? run.start_date_local ?? '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : 'other';
};

const urlFor = (bucket: string): string => {
  // PATH_PREFIX is handed to Vite without a trailing slash, and BASE_URL keeps
  // it verbatim, so the separator cannot be assumed.
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}data/tracks/tracks-${bucket}.json`;
};

const fetchBucket = (bucket: string): Promise<void> => {
  const inFlight = pending.get(bucket);
  if (inFlight) return inFlight;
  const request: Promise<void> = Promise.resolve()
    .then(async () => {
      const response = await fetch(urlFor(bucket));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as TrackEntry[];
    })
    .then((entries) => {
      for (const entry of entries) {
        polylines.set(entry.run_id, entry.summary_polyline);
      }
      loadedBuckets.add(bucket);
      failures.delete(bucket);
    })
    .catch((error: unknown) => {
      failures.set(bucket, String(error));
    })
    .finally(() => {
      pending.delete(bucket);
      notify();
    });
  pending.set(bucket, request);
  return request;
};

const bucketsNeeded = (runs: readonly TrackLike[]): string[] => {
  const wanted = new Set<string>();
  for (const run of runs) {
    if (!run.has_track && !run.summary_polyline) continue;
    if (polylines.has(run.run_id)) continue;
    wanted.add(bucketForRun(run));
  }
  return [...wanted];
};

/** Fetch every year the given records need and are missing. Idempotent. */
export const ensureTracks = async (
  runs: readonly TrackLike[]
): Promise<void> => {
  const buckets = bucketsNeeded(runs);
  if (buckets.length === 0) return;
  await Promise.all(buckets.map(fetchBucket));
};

export const trackFor = (runId: number): string | null =>
  polylines.get(runId) ?? null;

/** Geometry the page can already draw, out of the geometry it was asked for. */
export const trackProgress = (runs: readonly TrackLike[]) => {
  const buckets = new Set<string>();
  let wanted = 0;
  let present = 0;
  for (const run of runs) {
    if (!run.has_track && !run.summary_polyline) continue;
    wanted += 1;
    if (polylines.has(run.run_id)) present += 1;
    else buckets.add(bucketForRun(run));
  }
  const missing = [...buckets];
  return {
    wanted,
    present,
    pendingBuckets: missing.filter((bucket) => !loadedBuckets.has(bucket)),
    failedBuckets: missing.filter((bucket) => failures.has(bucket)),
  };
};

export const subscribeTracks = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
