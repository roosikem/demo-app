import { normalizeHex } from '../color-picker/color-utils';
import {
  ArcText,
  Badge,
  BadgeIcon,
  BubbleStyle,
  Decoration,
  FrameConfig,
  RingFill,
  RingLayer,
  Stencil,
} from '../models/frame.model';
import { deepFreeze } from '../models/freeze';
import { clamp } from '../rendering/custom-frame';

export { deepFreeze };

const SAFE_ID = /^[A-Za-z0-9][\w-]{0,63}$/;
const RESERVED_IDS = ['constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf'];
const ICONS: readonly BadgeIcon[] = ['none', 'check', 'star', 'heart', 'cloud'];
const BUBBLE_STYLES: readonly BubbleStyle[] = ['floating', 'joined', 'flush'];
// stencil images are PNG or WebP only (no SVG)
const IMAGE_EXTENSIONS = /\.(png|webp)$/i;
const MAX_TEXTS = 4;
const MAX_DECORATIONS = 24;
const MAX_COLORS = 12;

export interface StencilImagePolicy {
  /** https hosts besides the own origin */
  readonly imageHosts: readonly string[];
}

/** Drops invalid and duplicate entries; the result is a frozen copy. */
export function sanitizeStencils(input: unknown, policy: StencilImagePolicy): readonly Stencil[] {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const result: Stencil[] = [];
  for (const entry of list) {
    const stencil = sanitizeStencil(entry, policy);
    if (stencil && !seen.has(stencil.id)) {
      seen.add(stencil.id);
      result.push(stencil);
    }
  }
  return deepFreeze(result);
}

export function sanitizeStencil(input: unknown, policy: StencilImagePolicy): Stencil | null {
  if (!isObject(input) || typeof input['id'] !== 'string' || typeof input['label'] !== 'string') {
    return null;
  }
  const id = input['id'];
  const config = sanitizeConfig(input['config'], policy);
  if (!SAFE_ID.test(id) || RESERVED_IDS.indexOf(id) >= 0 || !config) {
    return null;
  }
  const category =
    typeof input['category'] === 'string' ? input['category'].slice(0, 30) : undefined;
  const tags = Array.isArray(input['tags'])
    ? input['tags']
        .filter((t): t is string => typeof t === 'string')
        .slice(0, 10)
        .map((t) => t.slice(0, 30))
    : undefined;
  return { id, label: input['label'].slice(0, 40), category, tags, config };
}

export function isAllowedStencilImage(url: string, policy: StencilImagePolicy): boolean {
  const base = typeof location === 'undefined' ? undefined : location.href;
  let parsed: URL;
  try {
    parsed = base ? new URL(url, base) : new URL(url);
  } catch {
    return false;
  }
  if (!IMAGE_EXTENSIONS.test(parsed.pathname)) {
    return false;
  }
  if (base && parsed.origin === location.origin) {
    return true;
  }
  return parsed.protocol === 'https:' && policy.imageHosts.indexOf(parsed.host) >= 0;
}

/** 'CDN.Example.com', 'cdn.example.com:443' -> 'cdn.example.com'; other ports are kept; invalid -> null */
export function normalizeImageHost(host: unknown): string | null {
  if (typeof host !== 'string' || !/^[^/?#@\\\s]+$/.test(host)) {
    return null;
  }
  try {
    return new URL(`https://${host}`).host;
  } catch {
    return null;
  }
}

function sanitizeConfig(input: unknown, policy: StencilImagePolicy): FrameConfig | null {
  if (!isObject(input)) {
    return null;
  }
  const texts = Array.isArray(input['texts']) ? input['texts'].slice(0, MAX_TEXTS) : [];
  const decorations = Array.isArray(input['decorations'])
    ? input['decorations'].slice(0, MAX_DECORATIONS)
    : [];
  const image =
    typeof input['image'] === 'string' && isAllowedStencilImage(input['image'], policy)
      ? input['image']
      : undefined;
  return {
    ring: sanitizeRing(input['ring']),
    texts: texts.map(sanitizeText).filter((t): t is ArcText => t !== null),
    badge: sanitizeBadge(input['badge']) ?? undefined,
    decorations: decorations.map(sanitizeDecoration).filter((d): d is Decoration => d !== null),
    photoClip: input['photoClip'] === 'outer' ? 'outer' : 'inner',
    photoBackground: hex(input['photoBackground'], '#eef1f4'),
    image,
  };
}

function sanitizeRing(input: unknown): RingLayer | null {
  if (!isObject(input)) {
    return null;
  }
  const fill = sanitizeFill(input['fill']);
  if (!fill) {
    return null;
  }
  const arc = isObject(input['arc']) ? sanitizeArc(input['arc']) : undefined;
  const innerLine = isObject(input['innerLine'])
    ? {
        color: hex(input['innerLine']['color'], '#ffffff'),
        width: clamp(num(input['innerLine']['width']), 0.005, 0.05),
      }
    : undefined;
  return { fill, width: clamp(num(input['width']), 0.02, 0.4), arc, innerLine };
}

// end may be > 360 for arcs that cross the top
function sanitizeArc(arc: Record<string, unknown>): { start: number; end: number } {
  const start = angle(arc['start']);
  return { start, end: start + clamp(num(arc['end']) - num(arc['start']), 1, 360) };
}

function sanitizeFill(input: unknown): RingFill | null {
  if (!isObject(input)) {
    return null;
  }
  if (input['type'] === 'solid') {
    return { type: 'solid', color: hex(input['color'], '#0b3d6e') };
  }
  if (
    (input['type'] === 'gradient' || input['type'] === 'segments') &&
    Array.isArray(input['colors'])
  ) {
    const colors = hexList(input['colors']);
    return colors.length ? { type: input['type'], colors } : null;
  }
  return null;
}

function sanitizeText(input: unknown): ArcText | null {
  if (!isObject(input) || typeof input['text'] !== 'string') {
    return null;
  }
  return {
    text: input['text'].slice(0, 40),
    color: hex(input['color'], '#ffffff'),
    center: angle(input['center']),
    direction: input['direction'] === 'ccw' ? 'ccw' : 'cw',
    maxSpan: input['maxSpan'] === undefined ? undefined : clamp(num(input['maxSpan']), 10, 330),
    fontFamily:
      typeof input['fontFamily'] === 'string' ? input['fontFamily'].slice(0, 60) : undefined,
    fontWeight:
      input['fontWeight'] === undefined ? undefined : clamp(num(input['fontWeight']), 100, 900),
    letterSpacing:
      input['letterSpacing'] === undefined ? undefined : clamp(num(input['letterSpacing']), 0, 0.5),
  };
}

function sanitizeBadge(input: unknown): Badge | null {
  if (!isObject(input)) {
    return null;
  }
  const lines = Array.isArray(input['lines'])
    ? input['lines']
        .filter((l): l is string => typeof l === 'string')
        .slice(0, 2)
        .map((l) => l.slice(0, 20))
    : [];
  const color = hex(input['color'], '#0b3d6e');
  const textColor = hex(input['textColor'], '#ffffff');
  if (input['shape'] === 'bubble') {
    const icon =
      ICONS.indexOf(input['icon'] as BadgeIcon) >= 0 ? (input['icon'] as BadgeIcon) : undefined;
    const style =
      BUBBLE_STYLES.indexOf(input['style'] as BubbleStyle) >= 0
        ? (input['style'] as BubbleStyle)
        : undefined;
    return { shape: 'bubble', color, textColor, lines, angle: angle(input['angle']), icon, style };
  }
  if (input['shape'] === 'diagonal') {
    const titleColors = Array.isArray(input['titleColors'])
      ? hexList(input['titleColors'])
      : undefined;
    const title = typeof input['title'] === 'string' ? input['title'].slice(0, 6) : '';
    return { shape: 'diagonal', color, textColor, title, titleColors, lines };
  }
  return null;
}

function sanitizeDecoration(input: unknown): Decoration | null {
  if (!isObject(input) || typeof input['symbol'] !== 'string') {
    return null;
  }
  return {
    symbol: input['symbol'].slice(0, 2),
    angle: angle(input['angle']),
    color: hex(input['color'], '#ffffff'),
  };
}

// plain objects only, so no values can come from a prototype
function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

function angle(value: unknown): number {
  const n = num(value);
  return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 0;
}

function hexList(values: unknown[]): string[] {
  return values
    .slice(0, MAX_COLORS)
    .map((c) => (typeof c === 'string' ? normalizeHex(c) : null))
    .filter((c): c is string => c !== null);
}

function hex(value: unknown, fallback: string): string {
  return (typeof value === 'string' ? normalizeHex(value) : null) ?? fallback;
}
