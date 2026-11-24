import { Stencil } from '../models/frame.model';
import { BG } from '../stencils/colors';

// stencils.json, written by scripts/face-frame-stencils.mjs:
// { "version": 1, "stencils": [{ "id": "img-star-ring", "file": "star-ring.png", "label": "Star ring",
//   "category": "Artwork", "tags": [] }] }
// Premade image stencils: PNG / WebP only, the text is part of the image, so no texts are added here.

export const MAX_MANIFEST_ENTRIES = 200;
// one optional subfolder, no "..", no absolute paths, URLs, queries or SVG
const SAFE_FILE = /^[a-z0-9][\w-]*(\/[a-z0-9][\w-]*)?\.(png|webp)$/i;
const MANIFEST_PATH = /\.json$/i;

const cache = new Map<string, Promise<readonly Stencil[]>>();

/**
 * Relative URLs are resolved like the app's own links (against <base href>), not against the current
 * route, so 'assets/…' also works on a deep link such as /profile/photo.
 */
export function resolveManifestUrl(url: string): URL {
  return new URL(url, document.baseURI);
}

/**
 * Turns the manifest into stencils; invalid entries are dropped. The result still goes through
 * sanitizeStencils (via the options), which also checks ids, lengths and the image URL.
 */
export function parseStencilManifest(data: unknown, manifestUrl: string): Stencil[] {
  const list = isObject(data) && Array.isArray(data['stencils']) ? data['stencils'] : [];
  const base = resolveManifestUrl(manifestUrl);
  const result: Stencil[] = [];
  for (const entry of list.slice(0, MAX_MANIFEST_ENTRIES)) {
    if (
      !isObject(entry) ||
      typeof entry['id'] !== 'string' ||
      typeof entry['file'] !== 'string' ||
      typeof entry['label'] !== 'string' ||
      !SAFE_FILE.test(entry['file'])
    ) {
      continue;
    }
    result.push({
      id: entry['id'],
      label: entry['label'],
      category: typeof entry['category'] === 'string' ? entry['category'] : undefined,
      tags: Array.isArray(entry['tags'])
        ? entry['tags'].filter((t): t is string => typeof t === 'string')
        : undefined,
      config: {
        // same folder as stencils.json (query / hash of the manifest URL are not used)
        image: new URL(entry['file'], base).href,
        ring: null,
        texts: [],
        photoClip: 'outer',
        photoBackground: BG,
      },
    });
  }
  return result;
}

/**
 * Same-origin .json only, no redirects. Loaded once per URL and page (a new deployment is seen after
 * a reload). Rejects when the file cannot be loaded; the next call tries again.
 */
export function loadStencilManifest(url: string): Promise<readonly Stencil[]> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetchManifest(url);
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
  }
  return pending;
}

async function fetchManifest(url: string): Promise<readonly Stencil[]> {
  const parsed = resolveManifestUrl(url);
  if (parsed.origin !== location.origin || !MANIFEST_PATH.test(parsed.pathname)) {
    throw new Error(`stencil manifest must be a same-origin .json file: ${url}`);
  }
  // no-cache: the browser revalidates, so a reload after a deployment gets the new list
  const response = await fetch(parsed.href, {
    credentials: 'same-origin',
    cache: 'no-cache',
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`stencil manifest ${url}: HTTP ${response.status}`);
  }
  return parseStencilManifest(await response.json(), parsed.href);
}

function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
