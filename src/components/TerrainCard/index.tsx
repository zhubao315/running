import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import type { Activity } from '@/utils/utils';
import { formatPace, formatRunTime } from '@/utils/utils';
import { sceneHashOf } from '@/vert/scenes';
import type { SceneMeta } from '@/vert/VertTerrain';

// Only this import pulls in Vert, and with it three.js: a chunk of its own, loaded on demand.
const VertTerrain = lazy(() => import('@/vert/VertTerrain'));

/** Shows `fallback` instead of a child that threw (no WebGL, a lost context, a bug). */
class TerrainBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const Skeleton = ({ message }: { message?: string }) => (
  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-[#2a2a2a] bg-gradient-to-br from-[#1a1f24] via-[#14181c] to-[#0d0d0d] text-sm text-[#7d7d7d] sm:aspect-video">
    {message}
  </div>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex items-baseline gap-1">
    <span className="text-[10px] uppercase tracking-wider text-[#6f6f6f]">
      {label}
    </span>
    <span className="font-mono text-[12px] text-[#d6d6d6]">{value}</span>
  </span>
);

interface TerrainCardProps {
  run: Activity;
  onClose: () => void;
}

/**
 * The 3D terrain panel for the selected run. Rendered only when a scene was baked for it; the
 * same box in every state (loading, loaded, failed) so the page does not jump.
 */
const TerrainCard = ({ run, onClose }: TerrainCardProps) => {
  const id = useId();
  const hash = sceneHashOf(run.run_id);
  const [meta, setMeta] = useState<SceneMeta | null>(null);
  const onMeta = useCallback((next: SceneMeta) => setMeta(next), []);

  useEffect(() => {
    setMeta(null);
  }, [run.run_id]);

  // Escape closes the panel, unless the profile already handled it (it clears its scrub).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (hash === undefined) return null;

  const date = new Date(run.start_date_local).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const pace = run.average_speed ? formatPace(run.average_speed) : null;

  return (
    <section
      aria-labelledby={id}
      data-terrain-card
      className="terrain-in relative mt-6 overflow-hidden rounded-2xl border border-[#2b2b2b] bg-gradient-to-b from-[#191919] to-[#111] shadow-[0_18px_50px_-20px_rgba(0,0,0,0.8)]"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭 3D 地形"
        className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-[#8a8a8a] transition-colors hover:bg-[#262626] hover:text-white"
      >
        <svg
          viewBox="0 0 20 20"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#242424] px-4 py-3 pr-10 sm:px-5 sm:pr-12">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#e0ed5e] px-1.5 py-0.5 text-[10px] font-bold leading-tight text-black">
              3D 地形
            </span>
            <h2
              id={id}
              className="truncate text-lg font-bold text-[#f2f2f2] sm:text-xl"
            >
              {run.name || 'Untitled'}
            </h2>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Stat label="日期" value={date} />
            <Stat
              label="距离"
              value={`${(run.distance / 1000).toFixed(2)} km`}
            />
            <Stat label="用时" value={formatRunTime(run.moving_time)} />
            {pace ? <Stat label="配速" value={`${pace} /km`} /> : null}
            {meta ? (
              <>
                <Stat label="爬升" value={`+${meta.climb} m`} />
                {meta.summit !== null ? (
                  <Stat
                    label="最高点"
                    value={`km ${(meta.summit / 1000).toFixed(1)}`}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="p-3 sm:p-4">
        <TerrainBoundary
          fallback={<Skeleton message="该设备无法显示 3D 地形。" />}
        >
          <Suspense fallback={<Skeleton message="地形加载中…" />}>
            <VertTerrain
              key={run.run_id}
              sceneId={String(run.run_id)}
              hash={hash}
              title={run.name || 'Untitled'}
              onMeta={onMeta}
            />
          </Suspense>
        </TerrainBoundary>
        <p className="mt-2 text-right text-[10px] text-[#5f5f5f]">
          场景在构建期烘焙，不含坐标；地形在浏览器本地渲染
        </p>
      </div>
    </section>
  );
};

export default TerrainCard;
