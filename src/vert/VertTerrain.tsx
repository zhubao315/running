import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ElevationProfile,
  TERRAIN_ATTRIBUTION_LINK,
  TerrainView,
  type Scene,
  type TerrainViewHandle,
  type TerrainViewMode,
} from '@geekplux/vert';
import '@geekplux/vert/vert.css';
import { loadScene } from './loadScene';

export interface SceneMeta {
  climb: number;
  summit: number | null;
  extent: { x: number; y: number };
}

export interface VertTerrainProps {
  /** The scene's file name base, i.e. the run id. */
  sceneId: string;
  /** The sidecar's hash, from `src/static/scenes.json`. */
  hash: string;
  /** The activity's name, for the canvas's accessible name. */
  title: string;
  /** Climb, summit distance and extent, reported once the scene decodes. */
  onMeta?: (_meta: SceneMeta) => void;
}

/** Room kept free at the bottom of the box for the credit link. */
const INSETS = { top: 0, right: 0, bottom: 44, left: 0 };

const km = (metres: number) => (metres / 1000).toFixed(1);

/** What the canvas shows, in words. */
function describe(title: string, scene: Scene): string {
  const { route, markers, summary } = scene;
  const from = km(route.distance[0] ?? 0);
  const to = km(route.distance[route.distance.length - 1] ?? 0);
  const marks = [
    markers.finish ? 'start ○, finish ◉' : 'start and finish ○ (a loop)',
    markers.summit
      ? `highest point ▲ at km ${km(markers.summit.distance)}`
      : null,
  ].filter((mark) => mark !== null);
  return (
    `3D terrain of ${title}, ${km(summary.extent.x)} by ${km(summary.extent.y)} km, ` +
    `with the route drawn from km ${from} to km ${to}; markers: ${marks.join(', ')}.`
  );
}

/** The elevation at a distance along the drawn route (linear between samples). */
function elevationAt(scene: Scene, metres: number): number | null {
  const { distance, elevation } = scene.route;
  if (!distance.length) return null;
  let lo = 0;
  let hi = distance.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((distance[mid] ?? 0) < metres) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.min(Math.max(lo, 1), distance.length - 1);
  const d0 = distance[i - 1] ?? 0;
  const d1 = distance[i] ?? d0;
  const e0 = elevation[i - 1] ?? 0;
  const e1 = elevation[i] ?? e0;
  const t = d1 === d0 ? 0 : (metres - d0) / (d1 - d0);
  return Math.round(e0 + (e1 - e0) * t);
}

export default function VertTerrain({
  sceneId,
  hash,
  title,
  onMeta,
}: VertTerrainProps) {
  const [scene, setScene] = useState<Scene | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<TerrainViewMode>('oblique');
  const [scrub, setScrub] = useState<number | null>(null);
  const view = useRef<TerrainViewHandle>(null);

  useEffect(() => {
    const controller = new AbortController();
    setScene(null);
    setFailed(false);
    setScrub(null);
    loadScene(sceneId, hash, controller.signal).then(
      (loaded) => {
        setScene(loaded);
        setFailed(loaded === null);
        if (loaded) {
          onMeta?.({
            climb: Math.round(loaded.summary.climb),
            summit: loaded.markers.summit
              ? Math.round(loaded.markers.summit.distance)
              : null,
            extent: loaded.summary.extent,
          });
        }
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      }
    );
    return () => controller.abort();
  }, [sceneId, hash, onMeta]);

  const reset = useCallback(() => {
    view.current?.resetView();
    setScrub(null);
  }, []);

  const scrubKm = scrub === null ? null : km(scrub);
  const scrubEle = scene && scrub !== null ? elevationAt(scene, scrub) : null;

  return (
    <div
      className="w-full"
      style={
        {
          '--surface': '#1e242a',
          '--surface-strong': '#2a323a',
          '--ink': '#dfe7ee',
          '--muted': '#98a2ac',
          '--route': '#e0ed5e',
          '--white': '#ffffff',
          '--vert-focus': '#e0ed5e',
        } as CSSProperties
      }
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] sm:aspect-video">
        {scene ? (
          <TerrainView
            ref={view}
            scene={scene}
            view={mode}
            exaggeration={1.6}
            scrub={scrub}
            insets={INSETS}
            ariaLabel={describe(title, scene)}
            className="absolute inset-0"
          />
        ) : failed ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[#8a8a8a]">
            该浏览器无法显示 3D 地形，或场景文件缺失。
          </p>
        ) : (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#1a1f24] via-[#14181c] to-[#0d0d0d]">
            <p className="absolute inset-0 flex items-center justify-center text-sm text-[#7d7d7d]">
              地形加载中…
            </p>
          </div>
        )}

        {/* View switch, floating on the canvas. */}
        <div className="absolute right-3 top-3 flex overflow-hidden rounded-full border border-white/15 bg-black/50 text-[11px] backdrop-blur">
          <button
            type="button"
            onClick={() => setMode('oblique')}
            className={`px-3 py-1.5 transition-colors ${
              mode === 'oblique'
                ? 'bg-[#e0ed5e] font-semibold text-black'
                : 'text-white/70 hover:text-white'
            }`}
            aria-pressed={mode === 'oblique'}
          >
            3D
          </button>
          <button
            type="button"
            onClick={() => setMode('flat')}
            className={`px-3 py-1.5 transition-colors ${
              mode === 'flat'
                ? 'bg-[#e0ed5e] font-semibold text-black'
                : 'text-white/70 hover:text-white'
            }`}
            aria-pressed={mode === 'flat'}
          >
            平面
          </button>
        </div>

        {/* Camera controls, floating bottom left. */}
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => view.current?.rotateBy(Math.PI / 4)}
            disabled={!scene || mode === 'flat'}
            className="rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur transition-colors hover:bg-black/70 disabled:opacity-35"
          >
            旋转
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!scene}
            className="rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur transition-colors hover:bg-black/70 disabled:opacity-35"
          >
            复位
          </button>
        </div>
      </div>

      <p className="mt-1 text-right text-[10px] text-[#5f5f5f]">
        <a
          className="transition-colors hover:text-[#9a9a9a]"
          href={TERRAIN_ATTRIBUTION_LINK.href}
          target="_blank"
          rel="noreferrer"
        >
          Elevation: {TERRAIN_ATTRIBUTION_LINK.text}
        </a>
      </p>

      {scene ? (
        <div className="mt-2 rounded-xl border border-[#242424] bg-[#101010] px-3 pb-2 pt-3">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 px-1">
            <span className="text-[11px] tracking-wide text-[#8a8a8a]">
              海拔剖面
            </span>
            <span className="font-mono text-[11px] text-[#cfcfcf]">
              {scrubKm === null
                ? '点击或拖动查看任意位置'
                : `km ${scrubKm}${scrubEle === null ? '' : ` · ${scrubEle} m`}`}
            </span>
          </div>
          <ElevationProfile
            scene={scene}
            scrub={scrub}
            onScrub={setScrub}
            height={120}
            label="海拔剖面"
          />
        </div>
      ) : null}
    </div>
  );
}
