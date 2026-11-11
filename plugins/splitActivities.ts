import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Plugin } from 'vite';

/**
 * Split src/static/activities.json (the pipeline's single source of truth) into
 * the two shapes the page actually needs.
 *
 * The records travel without `summary_polyline`, as a module the bundle can
 * evaluate synchronously: every statistic, table and calendar cell is computed
 * from them, and none of them ever needed the geometry. The polylines become
 * one JSON file per year under `data/tracks/`, fetched only when a map is about
 * to draw them. Before this split the whole file was one 18.7 MB chunk
 * (5.78 MB gzipped) that every visit had to download before the first number
 * appeared.
 *
 * Nothing extra is committed: the metadata is a virtual module and the per-year
 * files are build assets, so activities.json stays the only copy of the data.
 */

const META_ID = '\0virtual:activities-meta';
const SOURCE_REL = path.join('src', 'static', 'activities.json');
const SPECIFIER = /(^|[\\/])static[\\/]activities\.json$/;
const TRACK_PATH = /\/data\/tracks\/tracks-([0-9]{4}|other)\.json$/;

type ActivityRecord = {
  run_id: number;
  start_date_local?: string;
  summary_polyline?: string | null;
  [key: string]: unknown;
};

type Split = {
  meta: string;
  tracks: Map<string, string>;
};

const bucketOf = (record: ActivityRecord): string => {
  const year = String(record.start_date_local ?? '').slice(0, 4);
  return /^[0-9]{4}$/.test(year) ? year : 'other';
};

const split = (records: ActivityRecord[]): Split => {
  const collected = new Map<
    string,
    { run_id: number; summary_polyline: string }[]
  >();
  const meta = records.map((record) => {
    const { summary_polyline, ...rest } = record;
    const polyline =
      typeof summary_polyline === 'string' ? summary_polyline : '';
    if (polyline.length === 0) return rest;
    const bucket = bucketOf(record);
    const list = collected.get(bucket) ?? [];
    list.push({ run_id: record.run_id, summary_polyline: polyline });
    collected.set(bucket, list);
    // A record whose geometry has not been fetched yet must still be able to
    // say honestly that geometry exists.
    return { ...rest, has_track: true };
  });
  const tracks = new Map<string, string>();
  for (const [bucket, list] of collected) {
    tracks.set(bucket, JSON.stringify(list));
  }
  return { meta: JSON.stringify(meta), tracks };
};

export default function splitActivities(): Plugin {
  let sourcePath = '';
  let cache: Split | null = null;

  const loadSplit = async (): Promise<Split> => {
    if (!cache) cache = split(JSON.parse(await readFile(sourcePath, 'utf-8')));
    return cache;
  };

  return {
    name: 'split-activities',
    enforce: 'pre',

    configResolved(config) {
      sourcePath = path.resolve(config.root, SOURCE_REL);
    },

    async resolveId(source, importer) {
      if (!SPECIFIER.test(source)) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (!resolved || path.resolve(resolved.id) !== sourcePath) return null;
      return META_ID;
    },

    async load(id) {
      if (id !== META_ID) return null;
      return `export default ${(await loadSplit()).meta};`;
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = TRACK_PATH.exec((req.url ?? '').split('?')[0]);
        if (!match) {
          next();
          return;
        }
        loadSplit().then(
          (built) => {
            const body = built.tracks.get(match[1]);
            if (body === undefined) {
              res.statusCode = 404;
              res.end('no such track bucket');
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(body);
          },
          (error: unknown) => {
            server.config.logger.error(`split-activities: ${String(error)}`);
            res.statusCode = 500;
            res.end('track split failed');
          }
        );
      });
    },

    handleHotUpdate({ file, server }) {
      if (path.resolve(file) !== sourcePath) return undefined;
      cache = null;
      const meta = server.moduleGraph.getModuleById(META_ID);
      if (!meta) return undefined;
      server.moduleGraph.invalidateModule(meta);
      return [meta];
    },

    async generateBundle() {
      const built = await loadSplit();
      for (const [bucket, body] of built.tracks) {
        this.emitFile({
          type: 'asset',
          fileName: `data/tracks/tracks-${bucket}.json`,
          source: body,
        });
      }
    },
  };
}
