import { Badge, BadgeIcon, FrameConfig, RingFill } from '../models/frame.model';
import { NAVY, PHOTO_BG, TEAL, WHITE } from '../stencils/colors';
import { FONTS, PALETTES, Palette } from '../stencils/stencils';

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
}

export const DEFAULT_CUSTOM_STATE: CustomFrameState = {
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
};

export const TEXT_MAX_LENGTH = 32;
export const RING_WIDTH = { min: 8, max: 30 } as const;
export const BADGE_LINE_MAX_LENGTH = 14;

// text positions per badge type, so the texts don't overlap the badge
const TEXT_LAYOUT: Record<CustomFrameState['badge'], { top: number; topSpan: number; bottom: number; bottomSpan: number }> = {
  none: { top: 0, topSpan: 150, bottom: 180, bottomSpan: 150 },
  bubble: { top: 0, topSpan: 150, bottom: 215, bottomSpan: 100 },
  diagonal: { top: 322, topSpan: 70, bottom: 232, bottomSpan: 64 },
};

export interface TextLimits {
  readonly text: number;
  readonly badgeLine: number;
}

export function buildCustomFrame(
  s: CustomFrameState,
  palettes: readonly Palette[] = PALETTES,
  limits: TextLimits = { text: TEXT_MAX_LENGTH, badgeLine: BADGE_LINE_MAX_LENGTH },
): FrameConfig {
  const palette = paletteColors(s.paletteId, palettes);
  const fill: RingFill = s.ringStyle === 'solid'
    ? { type: 'solid', color: s.ringColor }
    : { type: s.ringStyle, colors: palette };
  const width = clamp(s.ringWidth, RING_WIDTH.min, RING_WIDTH.max) / 100;
  const layout = TEXT_LAYOUT[s.badge];
  return {
    ring: { fill, width, innerLine: s.innerLine ? { color: WHITE, width: 0.02 } : undefined },
    texts: [
      {
        text: s.topText.slice(0, limits.text), color: s.topColor, center: layout.top, direction: 'cw',
        fontFamily: s.fontFamily, maxSpan: layout.topSpan,
      },
      {
        text: s.bottomText.slice(0, limits.text), color: s.bottomColor, center: layout.bottom,
        direction: 'ccw', fontFamily: s.fontFamily, maxSpan: layout.bottomSpan,
      },
    ],
    badge: buildBadge(s, limits.badgeLine),
    photoClip: 'inner',
    photoBackground: PHOTO_BG,
  };
}

function buildBadge(s: CustomFrameState, maxLine: number): Badge | undefined {
  const lines = [s.badgeLine1, s.badgeLine2].map(l => l.slice(0, maxLine));
  switch (s.badge) {
    case 'bubble':
      return { shape: 'bubble', color: s.badgeColor, textColor: s.badgeTextColor, lines, angle: 135, icon: s.badgeIcon };
    case 'diagonal':
      return { shape: 'diagonal', color: s.badgeColor, textColor: s.badgeTextColor, title: lines[0], lines: [lines[1]] };
    case 'none':
      return undefined;
  }
}

export function ringBackground(s: CustomFrameState, palettes: readonly Palette[] = PALETTES): string {
  return s.ringStyle === 'solid' ? s.ringColor : paletteColors(s.paletteId, palettes)[0] ?? s.ringColor;
}

function paletteColors(id: string, palettes: readonly Palette[]): readonly string[] {
  return (palettes.find(p => p.id === id) ?? palettes[0] ?? PALETTES[0]).colors;
}

export function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
