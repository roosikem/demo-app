import { FrameConfig, Stencil } from '../models/frame.model';
import { AQUA, BG, BLUE, BROWN, CORAL, DEEP_MINT, GOLD, GREEN, INK, LIGHT_YELLOW, LIME, MINT, NAVY, NIGHT, ORANGE, PAPER, PHOTO_BG, PURPLE, RED, SKY, SPRING, TEAL, VIOLET, WHITE, YELLOW } from './colors';

// Base stencils. Texts are placeholders until the official content is defined.

export const DEFAULT_CUSTOM_FRAME: FrameConfig = {
  ring: { fill: { type: 'solid', color: NAVY }, width: 0.17 },
  texts: [
    { text: 'text on top', color: WHITE, center: 0, direction: 'cw' },
    { text: 'text at bottom', color: WHITE, center: 180, direction: 'ccw' },
  ],
  photoClip: 'inner',
  photoBackground: PHOTO_BG,
};

export const STENCILS: readonly Stencil[] = [
  {
    id: 'classic',
    category: 'Classic',
    label: 'Classic',
    config: DEFAULT_CUSTOM_FRAME,
  },
  {
    id: 'celebrate',
    category: 'Celebration',
    label: 'Celebrate',
    config: {
      ring: { fill: { type: 'segments', colors: [YELLOW, CORAL, GREEN, BLUE, YELLOW, CORAL] }, width: 0.2 },
      texts: [{ text: '#Celebrate', color: INK, center: 180, direction: 'ccw', maxSpan: 110, fontWeight: 800 }],
      decorations: [
        { symbol: '×', angle: 30, color: WHITE },
        { symbol: '◇', angle: 70, color: WHITE },
        { symbol: '»', angle: 110, color: WHITE },
        { symbol: '×', angle: 250, color: WHITE },
        { symbol: '◇', angle: 290, color: WHITE },
        { symbol: '«', angle: 330, color: WHITE },
      ],
      photoClip: 'inner',
      photoBackground: BG,
    },
  },
  {
    id: 'anniversary',
    category: 'Celebration',
    label: 'Anniversary',
    config: {
      ring: { fill: { type: 'gradient', colors: [MINT, SKY, VIOLET] }, width: 0.16, arc: { start: 200, end: 470 } },
      texts: [{ text: '10 years', color: DEEP_MINT, center: 285, direction: 'cw', maxSpan: 70, fontWeight: 800 }],
      photoClip: 'outer',
      photoBackground: BG,
    },
  },
  {
    id: 'council',
    category: 'Team & Roles',
    label: 'Council',
    config: {
      ring: { fill: { type: 'solid', color: RED }, width: 0.2, innerLine: { color: WHITE, width: 0.02 } },
      texts: [
        { text: 'Works council', color: WHITE, center: 0, direction: 'cw', maxSpan: 160 },
        { text: 'For our people', color: WHITE, center: 180, direction: 'ccw', maxSpan: 160 },
      ],
      photoClip: 'inner',
      photoBackground: BG,
    },
  },
  {
    id: 'certified',
    category: 'Skills & Learning',
    label: 'Certified',
    config: {
      ring: null,
      texts: [],
      badge: {
        shape: 'diagonal', color: NIGHT, textColor: PAPER, title: 'AI', titleColors: [AQUA, SPRING],
        lines: ['Certified', 'Trainer'],
      },
      photoClip: 'outer',
      photoBackground: BG,
    },
  },
  {
    id: 'ambassador',
    category: 'Team & Roles',
    label: 'Ambassador',
    config: {
      ring: { fill: { type: 'solid', color: PURPLE }, width: 0.06 },
      texts: [],
      badge: { shape: 'bubble', color: PURPLE, textColor: WHITE, lines: ['Tech', 'Ambassador'], angle: 135, icon: 'cloud' },
      photoClip: 'inner',
      photoBackground: BG,
    },
  },
  {
    id: 'helper',
    category: 'Team & Roles',
    label: 'Here to help',
    config: {
      ring: { fill: { type: 'solid', color: TEAL }, width: 0.07 },
      texts: [],
      badge: { shape: 'bubble', color: TEAL, textColor: WHITE, lines: ['Here', 'to help'], angle: 135, icon: 'check' },
      photoClip: 'inner',
      photoBackground: BG,
    },
  },
  {
    id: 'mentor',
    category: 'Skills & Learning',
    label: 'Mentor',
    config: {
      ring: { fill: { type: 'gradient', colors: [GOLD, ORANGE, GOLD] }, width: 0.16 },
      texts: [{ text: 'Mentor', color: BROWN, center: 0, direction: 'cw', maxSpan: 70, fontWeight: 800 }],
      badge: { shape: 'bubble', color: ORANGE, textColor: WHITE, lines: ['Ask', 'me'], angle: 135, icon: 'star' },
      photoClip: 'inner',
      photoBackground: BG,
    },
  },
];

export interface Palette {
  readonly id: string;
  readonly label: string;
  readonly colors: readonly string[];
}

export const PALETTES: readonly Palette[] = [
  { id: 'ocean', label: 'Ocean', colors: [MINT, SKY, VIOLET] },
  { id: 'sunset', label: 'Sunset', colors: [YELLOW, CORAL, RED] },
  { id: 'forest', label: 'Forest', colors: [TEAL, GREEN, LIME] },
  { id: 'rainbow', label: 'Rainbow', colors: [CORAL, YELLOW, GREEN, BLUE, VIOLET] },
];

export const SWATCHES: readonly string[] = [NAVY, TEAL, PURPLE, RED, ORANGE, INK, WHITE];

export const TEXT_SWATCHES: readonly string[] = [WHITE, INK, LIGHT_YELLOW, NAVY, RED];

export const FONTS: readonly string[] = ['Arial, sans-serif', 'Verdana, sans-serif', 'Georgia, serif', 'Trebuchet MS, sans-serif', 'Courier New, monospace'];
