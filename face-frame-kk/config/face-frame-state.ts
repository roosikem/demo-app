import {
  BadgeIcon,
  BadgePosition,
  DEFAULT_PHOTO,
  ExportFormat,
  PhotoTransform,
} from '../models/frame.model';
import { normalizeHex } from '../color-picker/color-utils';
import { clamp, normalizeDegrees, round } from '../models/numbers';
import { CustomFrameState, RING_WIDTH, normalizeBadgeSize } from '../layout/custom-frame';
import { FaceFrameOptions } from './face-frame-options';
import { Sticker, sanitizeStickers } from '../stickers/sticker.model';

// What the user designed (tab, stencil, customized circle, photo position, stickers). The app saves it and passes
// it back; sanitizeFaceFrameState() checks a saved state before it is used.

export interface FaceFrameState {
  readonly tab: 'custom' | 'stencils';
  readonly custom: CustomFrameState;
  readonly stencilId: string;
  readonly photo: PhotoTransform;
  readonly downloadFormat: ExportFormat;
  /** Only used with features.stickers; missing = none. */
  readonly stickers?: readonly Sticker[];
  /** Moved round badge of a premade stencil (features.badgeMove); only for that stencil. */
  readonly stencilBadge?: StencilBadgePosition;
}

export interface StencilBadgePosition extends BadgePosition {
  readonly stencilId: string;
}

const RING_STYLES: readonly CustomFrameState['ringStyle'][] = ['solid', 'gradient', 'segments'];
const BADGES: readonly CustomFrameState['badge'][] = ['none', 'bubble', 'diagonal'];

export function initialFaceFrameState(o: FaceFrameOptions): FaceFrameState {
  return {
    tab: o.features.customTab || !o.features.stencilsTab ? 'custom' : 'stencils',
    custom: o.defaultCustom,
    // with the customized circle as the alternative, a stencil is applied only when the user picks one
    stencilId: o.features.customTab ? '' : (o.stencils[0]?.id ?? ''),
    // within the zoom range of the options, which may start above 1
    photo: sanitizePhoto(DEFAULT_PHOTO, o),
    downloadFormat: o.download.formats[0] ?? 'image/png',
  };
}

/**
 * Makes a state from outside (e.g. restored from storage) safe to use: unknown values fall back to the
 * defaults, colors must be hex, numbers are clamped and texts are cut to the allowed length.
 */
export function sanitizeFaceFrameState(
  input: Partial<FaceFrameState> | null | undefined,
  o: FaceFrameOptions,
): FaceFrameState {
  const defaults = initialFaceFrameState(o);
  if (!input || typeof input !== 'object') {
    return defaults;
  }
  return {
    tab: input.tab === 'custom' || input.tab === 'stencils' ? input.tab : defaults.tab,
    custom: sanitizeCustom(input.custom, o),
    stencilId: oneOf(
      input.stencilId,
      o.stencils.map((s) => s.id),
      defaults.stencilId,
    ),
    photo: sanitizePhoto(input.photo, o),
    downloadFormat: oneOf(input.downloadFormat, o.download.formats, defaults.downloadFormat),
    ...stickers(input.stickers, o),
    ...stencilBadge(input.stencilBadge, o),
  };
}

export function sanitizePhoto(
  p: Partial<PhotoTransform> | null | undefined,
  o: FaceFrameOptions,
): PhotoTransform {
  const rotation = Number(p?.rotation ?? 0);
  return {
    zoom: clamp(Number(p?.zoom ?? DEFAULT_PHOTO.zoom), o.zoom.min, o.zoom.max),
    rotation: Number.isFinite(rotation) ? ((((rotation + 180) % 360) + 360) % 360) - 180 : 0,
    offsetX: clamp(Number(p?.offsetX ?? 0), -0.5, 0.5),
    offsetY: clamp(Number(p?.offsetY ?? 0), -0.5, 0.5),
  };
}

function sanitizeCustom(
  c: Partial<CustomFrameState> | null | undefined,
  o: FaceFrameOptions,
): CustomFrameState {
  const d = o.defaultCustom;
  if (!c || typeof c !== 'object') {
    return d;
  }
  const color = (value: unknown, fallback: string): string =>
    (typeof value === 'string' ? normalizeHex(value) : null) ?? fallback;
  const text = (value: unknown, fallback: string, max: number): string =>
    (typeof value === 'string' ? value : fallback).slice(0, max);
  return {
    ringStyle: oneOf(c.ringStyle, RING_STYLES, d.ringStyle),
    ringColor: color(c.ringColor, d.ringColor),
    paletteId: oneOf(
      c.paletteId,
      o.palettes.map((p) => p.id),
      d.paletteId,
    ),
    ringWidth: clamp(Number(c.ringWidth ?? d.ringWidth), RING_WIDTH.min, RING_WIDTH.max),
    innerLine: c.innerLine === true,
    fontFamily: oneOf(c.fontFamily, o.fonts, d.fontFamily),
    topText: text(c.topText, d.topText, o.textMaxLength),
    topColor: color(c.topColor, d.topColor),
    bottomText: text(c.bottomText, d.bottomText, o.textMaxLength),
    bottomColor: color(c.bottomColor, d.bottomColor),
    badge: oneOf(c.badge, BADGES, d.badge),
    badgeLine1: text(c.badgeLine1, d.badgeLine1, o.badgeLineMaxLength),
    badgeLine2: text(c.badgeLine2, d.badgeLine2, o.badgeLineMaxLength),
    badgeColor: color(c.badgeColor, d.badgeColor),
    badgeTextColor: color(c.badgeTextColor, d.badgeTextColor),
    badgeIcon: oneOf<BadgeIcon>(c.badgeIcon, o.badgeIcons, d.badgeIcon),
    badgeSize: normalizeBadgeSize(c.badgeSize ?? d.badgeSize, normalizeBadgeSize(d.badgeSize)),
    ...badgePosition(c.badgePosition),
    ...textAngle('topTextAngle', c.topTextAngle),
    ...textAngle('bottomTextAngle', c.bottomTextAngle),
  };
}

/** One decimal, 0 .. 360; the key is left out when the value is not a number. */
function textAngle<K extends 'topTextAngle' | 'bottomTextAngle'>(
  key: K,
  value: unknown,
): Partial<Record<K, number>> {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {};
  }
  return { [key]: normalizeDegrees(round(normalizeDegrees(value), 1)) } as Partial<
    Record<K, number>
  >;
}

/** The key is left out when there is no valid position. */
function badgePosition(value: unknown): { badgePosition?: BadgePosition } {
  const position = sanitizeBadgePosition(value);
  return position ? { badgePosition: position } : {};
}

/** The key is left out without stickers, so a state without the feature looks as before. */
function stickers(value: unknown, o: FaceFrameOptions): { stickers?: readonly Sticker[] } {
  const list = sanitizeStickers(value, o.stickerEmojis);
  return list.length ? { stickers: list } : {};
}

/** Kept only for an existing stencil with a round badge. */
function stencilBadge(
  value: unknown,
  o: FaceFrameOptions,
): { stencilBadge?: StencilBadgePosition } {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const { stencilId } = value as Partial<StencilBadgePosition>;
  const stencil = o.stencils.find((s) => s.id === stencilId);
  const position = sanitizeBadgePosition(value);
  return stencil?.config.badge?.shape === 'bubble' && position
    ? { stencilBadge: { stencilId: stencil.id, ...position } }
    : {};
}

/** Both coordinates must be numbers; kept on the frame (0 .. 1) with four decimals. */
export function sanitizeBadgePosition(value: unknown): BadgePosition | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const { x, y } = value as Partial<BadgePosition>;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x + y)) {
    return null;
  }
  return { x: round(clamp(x, 0, 1), 4), y: round(clamp(y, 0, 1), 4) };
}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
