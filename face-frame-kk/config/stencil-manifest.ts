import { Stencil } from '../models/frame.model';
import { BG } from '../stencils/colors';
import { StickerImage } from '../stickers/sticker.model';
import { SAFE_ID } from '../models/ids';
import { fetchJson } from './json-fetch';

// stencils.json, written by scripts/face-frame-stencils.mjs or served from the stencil zip:
// { "version": 1, "stencils": [{ "id": "img-star-ring", "file": "star-ring.png", "label": "Star ring",
//   "category": "Artwork", "tags": [] }],
//   "stickers": [{ "id": "heart", "file": "stickers/heart.png", "label": "Heart" }] }
// Premade image stencils: PNG only, the text is part of the image, so no texts are added here. Stickers are
// optional and always in the folder stickers/.

export interface StencilManifest {
  readonly stencils: readonly Stencil[];
  readonly stickers: readonly StickerImage[];
}

export const MAX_MANIFEST_ENTRIES = 200;
export const MAX_MANIFEST_STICKERS = 100;
// one optional subfolder, no "..", no absolute paths, URLs, queries or SVG
const SAFE_FILE = /^[a-z0-9][\w-]*(\/[a-z0-9][\w-]*)?\.png$/i;
const STICKER_FOLDER = 'stickers/';
const MAX_STICKER_LABEL = 40;
const MANIFEST_PATH = /\.json$/i;
const LOAD_TIMEOUT_MS = 10000;

const cache = new Map<string, Promise<StencilManifest>>();

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
export function parseStencilManifest(data: unknown, manifestUrl: string): StencilManifest {
  const base = resolveManifestUrl(manifestUrl);
  return {
    stencils: parseStencils(listOf(data, 'stencils', MAX_MANIFEST_ENTRIES), base),
    stickers: parseStickers(listOf(data, 'stickers', MAX_MANIFEST_STICKERS), base),
  };
}

function parseStencils(list: readonly unknown[], base: URL): Stencil[] {
  const result: Stencil[] = [];
  for (const entry of list) {
    if (!isEntry(entry) || entry.file.startsWith(STICKER_FOLDER)) {
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
        image: new URL(entry.file, base).href,
        ring: null,
        texts: [],
        photoClip: 'outer',
        photoBackground: BG,
      },
    });
  }
  return result;
}

/** Only images from the stickers folder, each id once (the saved design refers to it). */
function parseStickers(list: readonly unknown[], base: URL): StickerImage[] {
  const result: StickerImage[] = [];
  for (const entry of list) {
    if (
      isEntry(entry) &&
      entry.file.startsWith(STICKER_FOLDER) &&
      SAFE_ID.test(entry.id) &&
      entry.label.trim() &&
      !result.some((s) => s.id === entry.id)
    ) {
      // cut like the stencil labels (the server allows 40 characters)
      const label = entry.label.trim().slice(0, MAX_STICKER_LABEL);
      result.push({ id: entry.id, label, url: new URL(entry.file, base).href });
    }
  }
  return result;
}

function listOf(data: unknown, key: string, max: number): readonly unknown[] {
  const list = isObject(data) ? data[key] : undefined;
  return Array.isArray(list) ? list.slice(0, max) : [];
}

/** An entry with the common fields and a safe file name. */
function isEntry(
  entry: unknown,
): entry is Record<string, unknown> & { id: string; file: string; label: string } {
  return (
    isObject(entry) &&
    typeof entry['id'] === 'string' &&
    typeof entry['file'] === 'string' &&
    typeof entry['label'] === 'string' &&
    SAFE_FILE.test(entry['file'])
  );
}

/**
 * Same-origin .json only, no redirects. Loaded once per URL and page (a new deployment is seen after
 * a reload). Rejects when the file cannot be loaded; the next call tries again.
 */
export function loadStencilManifest(url: string): Promise<StencilManifest> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetchManifest(url);
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
  }
  return pending;
}

async function fetchManifest(url: string): Promise<StencilManifest> {
  const parsed = resolveManifestUrl(url);
  if (parsed.origin !== location.origin || !MANIFEST_PATH.test(parsed.pathname)) {
    throw new Error('stencil manifest must be a same-origin .json file');
  }
  return parseStencilManifest(
    await fetchJson(parsed.href, LOAD_TIMEOUT_MS, 'stencil manifest'),
    parsed.href,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
