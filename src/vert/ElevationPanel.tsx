import { useEffect, useMemo, useState } from 'react';
import type { Scene } from '@geekplux/vert';
import { loadScene } from './loadScene';

/**
 * The elevation profile of one run, drawn as plain SVG.
 *
 * It exists next to the 3D terrain because the two fail independently: a
 * browser without WebGL (or with hardware acceleration switched off) cannot
 * show the terrain, but the baked scene still carries the route's elevation,
 * and for a hike the climb profile *is* the record. The profile therefore
 * renders from the same scene file, without a WebGL context.
 *
 * Nothing is invented here: every number comes from the decoded scene, and a
 * scene that cannot be read says so instead of drawing an empty curve.
 */

export interface ElevationPanelProps {
  /** The scene's file name base, i.e. the run id. */
  sceneId: string;
  /** The sidecar's hash, from `src/static/scenes.json`. */
  hash: string;
  /** Line and fill colour; each site keeps its own accent. */
  accent?: string;
  /** Height of the plot in pixels. */
  height?: number;
}

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; scene: Scene };

/** At most this many points are drawn; the source has far more. */
const MAX_POINTS = 240;

const downsample = (values: Float64Array | Float32Array): number[] => {
  const total = values.length;
  if (total === 0) return [];
  const step = Math.max(1, Math.ceil(total / MAX_POINTS));
  const out: number[] = [];
  for (let i = 0; i < total; i += step) out.push(values[i]);
  const last = values[total - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
};

export default function ElevationPanel({
  sceneId,
  hash,
  accent = 'var(--accent)',
  height = 120,
}: ElevationPanelProps) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    loadScene(sceneId, hash).then(
      (scene) => {
        if (!alive) return;
        setState(scene ? { status: 'ready', scene } : { status: 'missing' });
      },
      () => {
        if (!alive) return;
        setState({ status: 'missing' });
      }
    );
    return () => {
      alive = false;
    };
  }, [sceneId, hash]);

  const profile = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { distance, elevation } = state.scene.route;
    const xs = downsample(distance);
    const ys = downsample(elevation);
    if (xs.length < 2) return null;

    const maxDistance = Math.max(...xs);
    const minElevation = Math.min(...ys);
    const maxElevation = Math.max(...ys);
    const span = maxElevation - minElevation || 1;

    const points = xs.map((x, i) => {
      const px = maxDistance > 0 ? (x / maxDistance) * 100 : 0;
      const py = 100 - ((ys[i] - minElevation) / span) * 100;
      return [px, py] as const;
    });

    const line = points
      .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`)
      .join(' ');
    const area = `${line} L100,100 L0,100 Z`;

    return {
      line,
      area,
      minElevation,
      maxElevation,
      maxDistance,
      climb: state.scene.summary.climb,
      summit: state.scene.markers.summit,
    };
  }, [state]);

  if (state.status === 'loading') {
    return (
      <div
        className="rounded-xl border border-[var(--terrain-border-soft)] bg-[var(--terrain-panel)] px-3 py-3"
        style={{ minHeight: height }}
      >
        <p className="text-[11px] text-[var(--terrain-muted)]">
          海拔剖面加载中…
        </p>
      </div>
    );
  }

  if (state.status === 'missing' || !profile) {
    return (
      <div className="rounded-xl border border-[var(--terrain-border-soft)] bg-[var(--terrain-panel)] px-3 py-3">
        <p className="text-[11px] text-[var(--terrain-muted)]">
          海拔剖面不可用：场景文件缺失或无法解码。
        </p>
      </div>
    );
  }

  const { climb, summit } = profile;

  return (
    <div className="rounded-xl border border-[var(--terrain-border-soft)] bg-[var(--terrain-panel)] px-3 pb-2 pt-3">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <span className="text-[11px] tracking-wide text-[var(--terrain-muted)]">
          海拔剖面
        </span>
        <span className="font-mono text-[11px] text-[var(--terrain-text)]">
          爬升 +{Math.round(climb)} m · {Math.round(profile.minElevation)}–
          {Math.round(profile.maxElevation)} m
          {summit ? ` · 最高点 km ${(summit.distance / 1000).toFixed(1)}` : ''}
        </span>
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`海拔剖面：累计爬升 ${Math.round(climb)} 米，最高 ${Math.round(
          profile.maxElevation
        )} 米，路线全长 ${(profile.maxDistance / 1000).toFixed(1)} 公里`}
        style={{ width: '100%', height }}
      >
        <path d={profile.area} style={{ fill: accent, fillOpacity: 0.14 }} />
        <path
          d={profile.line}
          style={{ fill: 'none', stroke: accent, strokeWidth: 1.2 }}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <div className="font-mono flex justify-between px-1 text-[10px] text-[var(--terrain-faint)]">
        <span>0.0 km</span>
        <span>{(profile.maxDistance / 1000).toFixed(1)} km</span>
      </div>
    </div>
  );
}
