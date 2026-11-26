import {
  BLUE,
  CORAL,
  GREEN,
  INK,
  LIGHT_YELLOW,
  LIME,
  MINT,
  NAVY,
  ORANGE,
  PURPLE,
  RED,
  SKY,
  TEAL,
  VIOLET,
  WHITE,
  YELLOW,
} from './colors';
import { deepFreeze } from '../models/freeze';

// Colors, palettes and fonts of the customized circle. The premade stencils come from the server (stencils.json
// in the stencil zip, see README.md); an app can still pass its own with options.stencils.

export interface Palette {
  readonly id: string;
  readonly label: string;
  readonly colors: readonly string[];
}

export const PALETTES: readonly Palette[] = deepFreeze([
  { id: 'ocean', label: 'Ocean', colors: [MINT, SKY, VIOLET] },
  { id: 'sunset', label: 'Sunset', colors: [YELLOW, CORAL, RED] },
  { id: 'forest', label: 'Forest', colors: [TEAL, GREEN, LIME] },
  { id: 'rainbow', label: 'Rainbow', colors: [CORAL, YELLOW, GREEN, BLUE, VIOLET] },
]);

export const SWATCHES: readonly string[] = deepFreeze([
  NAVY,
  TEAL,
  PURPLE,
  RED,
  ORANGE,
  INK,
  WHITE,
]);

export const TEXT_SWATCHES: readonly string[] = deepFreeze([WHITE, INK, LIGHT_YELLOW, NAVY, RED]);

export const FONTS: readonly string[] = deepFreeze([
  'Arial, sans-serif',
  'Verdana, sans-serif',
  'Georgia, serif',
  'Trebuchet MS, sans-serif',
  'Courier New, monospace',
]);
