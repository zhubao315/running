import scenes from '@/static/scenes.json';

/** run_id → the sidecar hash of its baked scene. Written by `scripts/bake-scenes.mjs`. */
const sceneHashes = scenes as Record<string, string>;

/** The scene hash of a run, or undefined when no scene was baked for it. */
export const sceneHashOf = (runId: number | string) =>
  sceneHashes[String(runId)];
