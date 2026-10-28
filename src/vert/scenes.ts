import scenes from '@/static/scenes.json';

/** run_id → the sidecar hash of its baked scene. Written by `scripts/bake-scenes.mjs`. */
const sceneHashes = scenes as Record<string, string>;

// Big run_ids (e.g. Keep/foooot sentinels ~1e19) lose precision when serialised as
// JSON numbers, so a plain string lookup can miss. Match by numeric value instead.
const byNumber = new Map<number, string>();
for (const [key, hash] of Object.entries(sceneHashes)) {
  byNumber.set(Number(key), hash);
}

/** The scene hash of a run, or undefined when no scene was baked for it. */
export const sceneHashOf = (runId: number | string) =>
  sceneHashes[String(runId)] ?? byNumber.get(Number(runId));
