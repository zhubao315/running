import { Component, lazy, Suspense, useId, type ReactNode } from 'react';
import type { Activity } from '@/utils/utils';
import { sceneHashOf } from '@/vert/scenes';

// Only this import pulls in Vert, and with it three.js: a chunk of its own, loaded on demand.
const VertTerrain = lazy(() => import('@/vert/VertTerrain'));

/** Shows `fallback` instead of a child that threw (no WebGL, a lost context, a bug). */
class TerrainBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
}> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const Fallback = ({ message }: { message?: string }) => (
  <div className="flex aspect-video w-full items-center justify-center rounded border border-[#333] bg-[#0f0f0f] text-sm text-[#8a8a8a]">
    {message}
  </div>
);

/**
 * The 3D terrain card for the selected run, only when a scene was baked for it. The card keeps
 * the same 16:9 box in every state (loading, loaded, failed) so the page does not jump.
 */
const TerrainCard = ({ run }: { run: Activity }) => {
  const id = useId();
  const hash = sceneHashOf(run.run_id);
  if (hash === undefined) return null;

  return (
    <section
      className="mt-6 rounded-lg border border-[#333] bg-[#141414] p-4"
      aria-labelledby={id}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-xl font-bold text-[#e0ed5e]">
          3D 地形 · {run.name || 'Untitled'}
        </h2>
        <p className="text-xs text-[#8a8a8a]">
          {new Date(run.start_date_local).toLocaleDateString('zh-CN')} ·{' '}
          {(run.distance / 1000).toFixed(2)} km
        </p>
      </div>
      <TerrainBoundary
        fallback={<Fallback message="该浏览器无法显示 3D 地形。" />}
      >
        <Suspense fallback={<Fallback message="地形加载中…" />}>
          <VertTerrain
            key={String(run.run_id)}
            sceneId={String(run.run_id)}
            hash={hash}
            title={run.name || 'Untitled'}
          />
        </Suspense>
      </TerrainBoundary>
      <p className="mt-2 text-right text-xs text-[#777]">
        在浏览器本地渲染，赛道坐标不会上传
      </p>
    </section>
  );
};

export default TerrainCard;
