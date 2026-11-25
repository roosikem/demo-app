import {
  ArcText,
  Badge,
  BadgeIcon,
  BadgePosition,
  FrameConfig,
  RingFill,
} from '../models/frame.model';
import { readableDirection } from './ring-gaps';
import { NAVY, PHOTO_BG, TEAL, WHITE } from '../stencils/colors';
import { FONTS, PALETTES, Palette } from '../stencils/stencils';
import { deepFreeze } from '../models/freeze';
import { clamp } from '../models/numbers';

// The customized circle: what the user picks on the custom tab, and how it is turned into a frame to draw.

export interface CustomFrameState {
  readonly ringStyle: 'solid' | 'gradient' | 'segments';
  readonly ringColor: string;
  readonly paletteId: string;
  /** percent of the radius, 8 .. 30 */
  readonly ringWidth: number;
  readonly innerLine: boolean;
  readonly fontFamily: string;
  readonly topText: string;
  readonly topColor: string;
  readonly bottomText: string;
  readonly bottomColor: string;
  readonly badge: 'none' | 'bubble' | 'diagonal';
  readonly badgeLine1: string;
  readonly badgeLine2: string;
  readonly badgeColor: string;
  readonly badgeTextColor: string;
  readonly badgeIcon: BadgeIcon;
  /** percent of the default badge size, 80 .. 130 in steps of 5; missing = defaultCustom.badgeSize (100) */
  readonly badgeSize?: number;
  /** center of the round badge moved by the user, 0 .. 1 of the frame; missing = on the ring, bottom right */
  readonly badgePosition?: BadgePosition;
  /** center of a text moved along the ring by the user, degrees (0 = top, clockwise); missing = as laid out */
  readonly topTextAngle?: number;
  readonly bottomTextAngle?: number;
}

export const DEFAULT_CUSTOM_STATE: CustomFrameState = deepFreeze({
  ringStyle: 'solid',
  ringColor: NAVY,
  paletteId: 'ocean',
  ringWidth: 17,
  innerLine: false,
  fontFamily: FONTS[0],
  topText: 'text on top',
  topColor: WHITE,
  bottomText: 'text at bottom',
  bottomColor: WHITE,
  badge: 'none',
  badgeLine1: 'Open',
  badgeLine2: 'to talk',
  badgeColor: TEAL,
  badgeTextColor: WHITE,
  badgeIcon: 'check',
  badgeSize: 100,
});

export const TEXT_MAX_LENGTH = 32;
export const RING_WIDTH = deepFreeze({ min: 8, max: 30 } as const);
export const BADGE_LINE_MAX_LENGTH = 14;
export const BADGE_SIZE = deepFreeze({ min: 80, max: 130, step: 5, initial: 100 } as const);
/** default position of the round badge: bottom right */
export const BADGE_ANGLE = 135;

/** In range and on the slider's steps; anything that is not a number gives `fallback`. */
export function normalizeBadgeSize(value: unknown, fallback: number = BADGE_SIZE.initial): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const stepped = Math.round(value / BADGE_SIZE.step) * BADGE_SIZE.step;
  return clamp(stepped, BADGE_SIZE.min, BADGE_SIZE.max);
}

// text positions per badge type, so the texts don't overlap the badge
const TEXT_LAYOUT: Record<
  CustomFrameState['badge'],
  { top: number; topSpan: number; bottom: number; bottomSpan: number }
> = {
  none: { top: 0, topSpan: 150, bottom: 180, bottomSpan: 150 },
  bubble: { top: 0, topSpan: 150, bottom: 215, bottomSpan: 100 },
  diagonal: { top: 322, topSpan: 70, bottom: 232, bottomSpan: 64 },
};

export interface TextLimits {
  readonly text: number;
  readonly badgeLine: number;
}

const DEFAULT_TEXT_LIMITS: TextLimits = { text: TEXT_MAX_LENGTH, badgeLine: BADGE_LINE_MAX_LENGTH };

export function buildCustomFrame(
  s: CustomFrameState,
  palettes: readonly Palette[] = PALETTES,
  limits: TextLimits = DEFAULT_TEXT_LIMITS,
): FrameConfig {
  const palette = paletteColors(s.paletteId, palettes);
  const fill: RingFill =
    s.ringStyle === 'solid'
      ? { type: 'solid', color: s.ringColor }
      : { type: s.ringStyle, colors: palette };
  const width = clamp(s.ringWidth, RING_WIDTH.min, RING_WIDTH.max) / 100;
  const layout = TEXT_LAYOUT[s.badge];
  return {
    ring: { fill, width, innerLine: s.innerLine ? { color: WHITE, width: 0.02 } : undefined },
    texts: [
      {
        text: s.topText.slice(0, limits.text),
        color: s.topColor,
        ...placed(s.topTextAngle, layout.top, 'cw'),
        fontFamily: s.fontFamily,
        maxSpan: layout.topSpan,
      },
      {
        text: s.bottomText.slice(0, limits.text),
        color: s.bottomColor,
        ...placed(s.bottomTextAngle, layout.bottom, 'ccw'),
        fontFamily: s.fontFamily,
        maxSpan: layout.bottomSpan,
      },
    ],
    badge: buildBadge(s, limits.badgeLine),
    photoClip: 'inner',
    photoBackground: PHOTO_BG,
  };
}

/** As laid out, or where the user moved it, turned to read upright there. */
function placed(
  moved: number | undefined,
  center: number,
  direction: ArcText['direction'],
): Pick<ArcText, 'center' | 'direction'> {
  return moved === undefined
    ? { center, direction }
    : { center: moved, direction: readableDirection(moved) };
}

function buildBadge(s: CustomFrameState, maxLine: number): Badge | undefined {
  const lines = [s.badgeLine1, s.badgeLine2].map((l) => l.slice(0, maxLine));
  const percent = s.badgeSize ?? BADGE_SIZE.initial;
  // only set when changed, so the config of existing designs stays the same
  const size = percent === BADGE_SIZE.initial ? {} : { scale: percent / 100 };
  switch (s.badge) {
    case 'bubble':
      return {
        shape: 'bubble',
        color: s.badgeColor,
        textColor: s.badgeTextColor,
        lines,
        angle: BADGE_ANGLE,
        icon: s.badgeIcon,
        ...size,
        ...(s.badgePosition ? { at: s.badgePosition } : {}),
      };
    case 'diagonal':
      return {
        shape: 'diagonal',
        color: s.badgeColor,
        textColor: s.badgeTextColor,
        title: lines[0],
        lines: [lines[1]],
        ...size,
      };
    case 'none':
      return undefined;
  }
}

export function ringBackground(
  s: CustomFrameState,
  palettes: readonly Palette[] = PALETTES,
): string {
  return s.ringStyle === 'solid'
    ? s.ringColor
    : (paletteColors(s.paletteId, palettes)[0] ?? s.ringColor);
}

function paletteColors(id: string, palettes: readonly Palette[]): readonly string[] {
  return (palettes.find((p) => p.id === id) ?? palettes[0] ?? PALETTES[0]).colors;
}
