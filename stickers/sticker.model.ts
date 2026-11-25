import { clamp, round, signedDegrees } from '../models/numbers';
import { Point, angleFromTop } from '../models/pointer';
import { SAFE_ID } from '../models/ids';

// Stickers placed freely on the framed photo. Positions and sizes are fractions of the frame size, so the same
// values work for the preview, the export and the saved state, whatever the canvas size.

/** What a sticker shows: an emoji, or an image from the sticker list in stencils.json (by its id). */
export type StickerContent =
  | { readonly emoji: string; readonly image?: never }
  | { readonly image: string; readonly emoji?: never };

export type Sticker = StickerContent & StickerPlacement;

interface StickerPlacement {
  readonly id: string;
  /** center, 0 .. 1 of the frame */
  readonly x: number;
  readonly y: number;
  /** edge length of the square sticker, fraction of the frame */
  readonly size: number;
  /** degrees, -180 .. 180 */
  readonly rotation: number;
}

export type StickerGeometry = Pick<StickerPlacement, 'x' | 'y' | 'size' | 'rotation'>;

/** An image sticker offered by the server (stencils.json); only its id is saved in a design. */
export interface StickerImage {
  readonly id: string;
  readonly label: string;
  /** same origin, PNG */
  readonly url: string;
}

export type StickerHandle = 'scale' | 'rotate';

export const MAX_STICKERS = 10;
// shared empty lists: a new [] on every state change would re-run the effects that read them
export const NO_STICKERS: readonly Sticker[] = Object.freeze([]);
export const NO_STICKER_IMAGES: readonly StickerImage[] = Object.freeze([]);
export const STICKER_SIZE = { min: 0.06, max: 0.6, initial: 0.18 } as const;
/** distance of the rotate handle from the sticker edge, fraction of the frame */
export const ROTATE_HANDLE_DISTANCE = 0.07;
/**
 * The center of a sticker stays inside the round frame (radius as in the renderer), so a sticker is never moved
 * where it would be clipped away completely.
 */
const CENTER_RADIUS = 0.49;

export const DEFAULT_STICKER_EMOJIS: readonly string[] = [
  '\u{1F600}', // grinning face
  '\u{1F60E}', // smiling face with sunglasses
  '\u{1F389}', // party popper
  '\u{2764}\u{FE0F}', // red heart
  '\u{2B50}', // star
  '\u{1F44D}', // thumbs up
  '\u{1F525}', // fire
  '\u{1F338}', // cherry blossom
];

const STICKER_ID = /^[A-Za-z0-9][\w-]{0,31}$/;
// a restored state is checked item by item; more than this is not a real design
const MAX_SANITIZED_ITEMS = 100;
const VARIATION_SELECTOR = /\uFE0F/g;
/** one start position per possible sticker, near the center first, so new stickers never cover each other */
const START_POSITIONS: readonly Point[] = [
  { x: 0.5, y: 0.42 },
  { x: 0.5, y: 0.58 },
  { x: 0.38, y: 0.42 },
  { x: 0.38, y: 0.58 },
  { x: 0.62, y: 0.42 },
  { x: 0.62, y: 0.58 },
  { x: 0.26, y: 0.42 },
  { x: 0.26, y: 0.58 },
  { x: 0.74, y: 0.42 },
  { x: 0.74, y: 0.58 },
];

/** A new sticker at the first start position that is not taken yet. */
export function createSticker(
  id: string,
  content: StickerContent,
  existing: readonly Sticker[],
): Sticker {
  const free = START_POSITIONS.find(
    (p) => !existing.some((s) => Math.abs(s.x - p.x) < 0.01 && Math.abs(s.y - p.y) < 0.01),
  );
  // all taken only when stickers were moved onto the start positions: then any of them is fine
  const start = free ?? START_POSITIONS[existing.length % START_POSITIONS.length];
  return clampSticker({ ...content, id, ...start, size: STICKER_SIZE.initial, rotation: 0 });
}

/** Unique within the list and across sessions, so a restored sticker never takes over a selection. */
export function newStickerId(existing: readonly Sticker[], now = Date.now()): string {
  const used = new Set(existing.map((s) => s.id));
  let n = 0;
  let id = `sticker-${now.toString(36)}`;
  while (used.has(id)) {
    id = `sticker-${now.toString(36)}-${++n}`;
  }
  return id;
}

export function clampSticker<T extends StickerGeometry>(s: T): T {
  const center = insideFrame({ x: clamp(s.x, 0, 1, 0.5), y: clamp(s.y, 0, 1, 0.5) });
  return {
    ...s,
    x: round(center.x, 4),
    y: round(center.y, 4),
    size: round(clamp(s.size, STICKER_SIZE.min, STICKER_SIZE.max, STICKER_SIZE.initial), 4),
    rotation: roundedDegrees(s.rotation),
  };
}

function insideFrame(p: Point): Point {
  const dx = p.x - 0.5;
  const dy = p.y - 0.5;
  const d = Math.hypot(dx, dy);
  return d <= CENTER_RADIUS
    ? p
    : { x: 0.5 + (dx * CENTER_RADIUS) / d, y: 0.5 + (dy * CENTER_RADIUS) / d };
}

/** Emojis are compared without the variation selector: a heart with and without U+FE0F is the same sticker. */
export function sameEmoji(a: string, b: string): boolean {
  return a.replace(VARIATION_SELECTOR, '') === b.replace(VARIATION_SELECTOR, '');
}

/**
 * Makes stickers from outside (e.g. a restored state) safe: only offered emojis or image ids of the right form,
 * unique ids, numbers in range, at most MAX_STICKERS.
 */
export function sanitizeStickers(input: unknown, emojis: readonly string[]): readonly Sticker[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const ids = new Set<string>();
  const result: Sticker[] = [];
  for (const item of input.slice(0, MAX_SANITIZED_ITEMS)) {
    const sticker = sanitizeSticker(item, emojis);
    if (sticker && !ids.has(sticker.id)) {
      ids.add(sticker.id);
      result.push(sticker);
    }
    if (result.length === MAX_STICKERS) {
      break;
    }
  }
  return result;
}

function sanitizeSticker(item: unknown, emojis: readonly string[]): Sticker | null {
  if (!isRecord(item) || typeof item['id'] !== 'string' || !STICKER_ID.test(item['id'])) {
    return null;
  }
  const content = stickerContent(item, emojis);
  if (!content) {
    return null;
  }
  return clampSticker({
    ...content,
    id: item['id'],
    x: numberOr(item['x'], 0.5),
    y: numberOr(item['y'], 0.5),
    size: numberOr(item['size'], STICKER_SIZE.initial),
    rotation: numberOr(item['rotation'], 0),
  });
}

function stickerContent(
  item: Record<string, unknown>,
  emojis: readonly string[],
): StickerContent | null {
  const { emoji, image } = item;
  if (typeof emoji === 'string' && image === undefined) {
    const offered = emojis.find((e) => sameEmoji(e, emoji));
    return offered ? { emoji: offered } : null;
  }
  if (typeof image === 'string' && emoji === undefined && SAFE_ID.test(image)) {
    return { image };
  }
  return null;
}

export function sameGeometry(a: StickerGeometry, b: StickerGeometry): boolean {
  return a.x === b.x && a.y === b.y && a.size === b.size && a.rotation === b.rotation;
}

export function sameStickers(a: readonly Sticker[], b: readonly Sticker[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (s, i) =>
        s.id === b[i].id &&
        s.emoji === b[i].emoji &&
        s.image === b[i].image &&
        sameGeometry(s, b[i]),
    )
  );
}

/** The stickers as shown while one of them is dragged. */
export function withDraft(stickers: readonly Sticker[], draft: Sticker | null): readonly Sticker[] {
  return draft ? stickers.map((s) => (s.id === draft.id ? draft : s)) : stickers;
}

/** Topmost sticker under the point (the last one in the list is drawn on top). */
export function stickerAt(stickers: readonly Sticker[], p: Point): Sticker | null {
  for (let i = stickers.length - 1; i >= 0; i--) {
    const local = toLocal(stickers[i], p);
    const half = stickers[i].size / 2;
    if (Math.abs(local.x) <= half && Math.abs(local.y) <= half) {
      return stickers[i];
    }
  }
  return null;
}

/**
 * Handle positions. The scale handle sits on a corner and the rotate handle beyond an edge; near the border of
 * the frame they move to a corner / edge that is still inside, so they can always be reached.
 */
export function handlePositions(s: StickerGeometry): Record<StickerHandle, Point> {
  const half = s.size / 2;
  const corners = [
    { x: half, y: half },
    { x: -half, y: half },
    { x: half, y: -half },
    { x: -half, y: -half },
  ].map((c) => fromLocal(s, c));
  const reach = half + ROTATE_HANDLE_DISTANCE;
  // above, below, right, left of the sticker (in its own rotation)
  const knobs = [
    { x: 0, y: -reach },
    { x: 0, y: reach },
    { x: reach, y: 0 },
    { x: -reach, y: 0 },
  ].map((k) => fromLocal(s, k));
  return {
    scale: corners.find(isInside) ?? corners[0],
    rotate: knobs.find(isInside) ?? knobs[0],
  };
}

/**
 * Handle under the point. The hit area is limited by the sticker size, so a small sticker can still be grabbed
 * in the middle (and moved) instead of always hitting a handle.
 */
export function handleAt(s: StickerGeometry, p: Point, hitRadius: number): StickerHandle | null {
  const radius = Math.min(hitRadius, s.size / 2);
  const handles = handlePositions(s);
  if (distance(handles.rotate, p) <= radius) {
    return 'rotate';
  }
  return distance(handles.scale, p) <= radius ? 'scale' : null;
}

/** Scale by the change of the pointer distance from the center since `from`. */
export function scaledBy<T extends StickerGeometry>(s: T, from: Point, to: Point): T {
  const start = distance(s, from);
  return start > 0 ? clampSticker({ ...s, size: (s.size * distance(s, to)) / start }) : s;
}

/** Rotate by the change of the pointer angle around the center since `from`, optionally snapped. */
export function rotatedBy<T extends StickerGeometry>(
  s: T,
  from: Point,
  to: Point,
  snapDegrees = 0,
): T {
  const degrees = s.rotation + angleAround(s, to) - angleAround(s, from);
  const snapped = snapDegrees > 0 ? Math.round(degrees / snapDegrees) * snapDegrees : degrees;
  return clampSticker({ ...s, rotation: snapped });
}

function angleAround(center: Point, p: Point): number {
  return angleFromTop(p.x - center.x, p.y - center.y);
}

function toLocal(s: StickerGeometry, p: Point): Point {
  const a = (-s.rotation * Math.PI) / 180;
  const dx = p.x - s.x;
  const dy = p.y - s.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

function fromLocal(s: StickerGeometry, p: Point): Point {
  const a = (s.rotation * Math.PI) / 180;
  return {
    x: s.x + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: s.y + p.x * Math.sin(a) + p.y * Math.cos(a),
  };
}

function isInside(p: Point): boolean {
  return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * -180 .. 180 with two decimals, 180 instead of -180. Rounded after normalising (the modulo arithmetic adds float
 * noise); the -180 check comes last because rounding can produce it (e.g. from -179.996).
 */
function roundedDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    return 0;
  }
  const d = round(signedDegrees(degrees), 2);
  return d === -180 ? 180 : d;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
