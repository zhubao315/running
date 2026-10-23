import { decodeScene, SceneError, type Scene } from '@geekplux/vert';

/**
 * Load one baked scene from `public/scenes/`.
 *
 * `hash` comes from the sidecar written by `vert-bake`; it is part of the URL so a re-bake
 * is fetched instead of a cached copy. Returns null when the scene is missing or not decodable
 * (a static host may answer a missing file with the SPA's index.html and a 200).
 */
export async function loadScene(
  id: string,
  hash: string,
  signal?: AbortSignal
): Promise<Scene | null> {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const response = await fetch(`${prefix}scenes/${id}.scene?v=${hash}`, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) return null;
  try {
    return decodeScene(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof SceneError) return null;
    throw error;
  }
}
