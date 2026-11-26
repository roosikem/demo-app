import { ArcText, Decoration } from '../models/frame.model';
import { FrameGeometry } from './frame-geometry';

// Measuring the texts on the ring: the largest font that fits a text into its maxSpan, and how many degrees it then
// covers. The drawing (scene/ring-texts.ts) and the move rules (badge and text placement) both use it.

export const DEFAULT_FONT = 'Arial, sans-serif';
const DEFAULT_WEIGHT = 700;
const DEFAULT_SPACING = 0.04;
const DEFAULT_MAX_SPAN = 150;
/** font size limit, relative to the band the text runs in */
export const FONT_OF_BAND = 0.62;

export interface FittedText {
  readonly text: string;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontSize: number;
  /** px between letters */
  readonly spacing: number;
  readonly radius: number;
  /** degrees the text covers */
  readonly span: number;
}

let measureContext: CanvasRenderingContext2D | null | undefined;
const middleOffsets = new Map<string, number>();

function measurer(): CanvasRenderingContext2D | null {
  if (measureContext === undefined) {
    measureContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  return measureContext;
}

/** A web font has loaded: offsets measured with the fallback font are dropped. */
export function forgetTextMetrics(): void {
  middleOffsets.clear();
}

/** Width of a text in px; 0 where there is no canvas (unit tests). */
export function textWidth(text: string, font: string): number {
  const ctx = measurer();
  if (!ctx) {
    return 0;
  }
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * offsetY that puts the middle of the em box of a one-line Konva.Text (lineHeight 1) on its y, as fillText does
 * with textBaseline 'middle'. Konva 10 centers on the font's bounding box instead, which sits a few px off.
 */
export function middleOffsetY(font: string, size: number): number {
  const cached = middleOffsets.get(font);
  if (cached !== undefined) {
    return cached;
  }
  const ctx = measurer();
  if (!ctx) {
    return size / 2;
  }
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  const alphabetic = ctx.measureText('M');
  ctx.textBaseline = 'middle';
  const middle = ctx.measureText('M');
  ctx.textBaseline = 'alphabetic';
  // how far the alphabetic baseline lies below the middle line
  const belowMiddle = alphabetic.actualBoundingBoxAscent - middle.actualBoundingBoxAscent;
  // where Konva puts the alphabetic baseline, from the top of the node
  const konvaBaseline =
    (alphabetic.fontBoundingBoxAscent - alphabetic.fontBoundingBoxDescent) / 2 + size / 2;
  const offset = konvaBaseline - belowMiddle;
  // the font string holds the size, so one entry per font and size
  if (middleOffsets.size > 500) {
    middleOffsets.clear();
  }
  middleOffsets.set(font, offset);
  return offset;
}

/** Band the texts run in; without a ring a band of 16 % of the radius. */
export function textBand(g: FrameGeometry): number {
  return g.outer - g.inner || g.outer * 0.16;
}

export function fitText(g: FrameGeometry, t: ArcText): FittedText | null {
  const text = t.text.trim();
  if (!text) {
    return null;
  }
  const band = textBand(g);
  const radius = g.outer - band / 2;
  const fontFamily = t.fontFamily ?? DEFAULT_FONT;
  const fontWeight = t.fontWeight ?? DEFAULT_WEIGHT;
  const spacingOfFont = t.letterSpacing ?? DEFAULT_SPACING;
  const chars = Array.from(text);
  // width grows linearly with the font size: measure once at the largest size, then scale down to fit
  const widthAt = (size: number): number =>
    chars.reduce(
      (sum, ch) =>
        sum + textWidth(ch, `${fontWeight} ${size}px ${fontFamily}`) + spacingOfFont * size,
      0,
    );
  const largest = band * FONT_OF_BAND;
  const largestWidth = widthAt(largest);
  const maxSpan = ((t.maxSpan ?? DEFAULT_MAX_SPAN) * Math.PI) / 180;
  const fontSize =
    largestWidth <= 0 || largestWidth / radius <= maxSpan
      ? largest
      : (largest * maxSpan) / (largestWidth / radius);
  const width = (largestWidth * fontSize) / largest;
  return {
    text,
    fontFamily,
    fontWeight,
    fontSize,
    spacing: spacingOfFont * fontSize,
    radius,
    span: ((width / radius) * 180) / Math.PI,
  };
}

/** Degrees a symbol on the ring covers, at least one square glyph wide. */
export function decorationSpan(g: FrameGeometry, d: Decoration): number {
  const band = g.outer - g.inner;
  const radius = g.outer - band / 2;
  if (radius <= 0 || band <= 0) {
    return 0;
  }
  const fontSize = band * FONT_OF_BAND;
  const width = Math.max(fontSize, textWidth(d.symbol, `700 ${fontSize}px ${DEFAULT_FONT}`));
  return ((width / radius) * 180) / Math.PI;
}
