import { decodeScene, SceneError, type Scene } from '@geekplux/vert';

/**
 * Load one baked scene from `public/scenes/`.
 *
 * `hash` comes from the sidecar written by `vert-bake`; it is part of the URL so a re-bake
 * is fetched instead of a cached copy. Returns null when the scene is missing or not decodable
 * (a static host may answer a missing file with the SPA's index.html and a 200).
 *
 * The decoded scene is cached per (id, hash): the 3D view and the 2D elevation
 * profile ask for the same file, and a scene is a few hundred kilobytes of
 * terrain — decoding it twice would double the work for nothing.
 */
const cache = new Map<string, Promise<Scene | null>>();

const fetchScene = async (id: string, hash: string): Promise<Scene | null> => {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const response = await fetch(`${prefix}scenes/${id}.scene?v=${hash}`, {
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
};

export async function loadScene(
  id: string,
  hash: string,
  _signal?: AbortSignal
): Promise<Scene | null> {
  const key = `${id}:${hash}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const request = fetchScene(id, hash).catch((error: unknown) => {
    // A failed load must not poison the cache: the next visit may succeed.
    cache.delete(key);
    throw error;
  });
  cache.set(key, request);
  return request;
}
