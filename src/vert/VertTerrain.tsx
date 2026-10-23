import { useEffect, useRef, useState, type CSSProperties } from 'react';
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

export interface VertTerrainProps {
  /** The scene's file name base, i.e. the run id. */
  sceneId: string;
  /** The sidecar's hash, from `src/static/scenes.json`. */
  hash: string;
  /** The activity's name, for the canvas's accessible name. */
  title: string;
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

/**
 * Vert's terrain and elevation profile for one run. Loaded lazily by `TerrainCard`, so three.js
 * only arrives on the page after a run with a baked scene is selected.
 */
export default function VertTerrain({
  sceneId,
  hash,
  title,
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
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      }
    );
    return () => controller.abort();
  }, [sceneId, hash]);

  const message = failed ? '地形加载失败。' : '地形加载中…';

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
      <div className="relative aspect-video w-full overflow-hidden rounded border border-[#333] bg-[#0f0f0f]">
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
        ) : (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[#8a8a8a]">
            {message}
          </p>
        )}
        <a
          className="absolute bottom-1 right-2 text-[10px] text-[#7d7d7d] hover:text-[#cfcfcf]"
          href={TERRAIN_ATTRIBUTION_LINK.href}
          target="_blank"
          rel="noreferrer"
        >
          Elevation: {TERRAIN_ATTRIBUTION_LINK.text}
        </a>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-[#3a3a3a] px-2 py-1 text-xs text-[#cfcfcf] hover:bg-[#242424] disabled:opacity-40"
          disabled={!scene || mode === 'flat'}
          onClick={() => view.current?.rotateBy(Math.PI / 4)}
        >
          旋转
        </button>
        <button
          type="button"
          className="rounded border border-[#3a3a3a] px-2 py-1 text-xs text-[#cfcfcf] hover:bg-[#242424] disabled:opacity-40"
          disabled={!scene}
          onClick={() => setMode(mode === 'flat' ? 'oblique' : 'flat')}
        >
          {mode === 'flat' ? '3D' : '平面'}
        </button>
        <button
          type="button"
          className="rounded border border-[#3a3a3a] px-2 py-1 text-xs text-[#cfcfcf] hover:bg-[#242424] disabled:opacity-40"
          disabled={!scene}
          onClick={() => {
            view.current?.resetView();
            setScrub(null);
          }}
        >
          复位
        </button>
        <span className="text-xs text-[#7d7d7d]">
          拖动下方剖面或键盘方向键可查看任意位置
        </span>
      </div>

      {scene ? (
        <div className="mt-2">
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
