import { deepFreeze } from '../models/freeze';

// Named colors shared by the palettes and the example stencils.

export const WHITE = '#ffffff';
export const INK = '#1b1b1b';
export const BG = '#eef1f4';

export const NAVY = '#0b3d6e';
export const TEAL = '#0f9b8e';
export const PURPLE = '#4b1d8f';
export const VIOLET = '#6f3ce0';
export const ORANGE = '#f28705';
export const YELLOW = '#f6c945';
export const CORAL = '#ef6b5b';
export const GREEN = '#29b37c';
export const GREEN_DARK = '#1e8a5e';
export const LIME = '#a3d977';
export const BLUE = '#2a8fd6';
export const SKY = '#2bb3e6';
export const MINT = '#00c2a8';
export const PINK = '#d6336c';
export const SLATE = '#475467';
export const RED = '#b3202a';
export const GOLD = '#f2b705';
export const LIGHT_YELLOW = '#ffd447';
export const NIGHT = '#0d0d1a';
export const PAPER = '#f4f4f4';
export const AQUA = '#19b6a4';
export const SPRING = '#2be38a';
export const PHOTO_BG = '#e9edf2';

// Dark text colors for light rings
export const BROWN = '#3a2500';
export const FOREST = '#0b2e1f';
export const DEEP_SEA = '#062a3a';
export const DEEP_MINT = '#063b33';

/** Accessible names of the swatch colors. */
export const COLOR_NAMES: Readonly<Record<string, string>> = deepFreeze({
  [NAVY]: 'Navy',
  [TEAL]: 'Teal',
  [PURPLE]: 'Purple',
  [RED]: 'Red',
  [ORANGE]: 'Orange',
  [INK]: 'Black',
  [WHITE]: 'White',
  [LIGHT_YELLOW]: 'Yellow',
});
