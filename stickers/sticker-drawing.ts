import { Geometry, outerRadius, textBand } from '../rendering/frame-renderer';
import { ROTATE_HANDLE_DISTANCE, Sticker, StickerGeometry, handlePositions } from './sticker.model';

// Draws the stickers on the canvas, and the outline and handles of the selected one.

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
/** emoji and image are drawn slightly smaller than their box, so they do not touch the selection frame */
const GLYPH_RATIO = 0.85;
/** drawn radius of the handles, fraction of the frame */
export const HANDLE_RADIUS = 0.022;
const OUTLINE = 'rgb(255 255 255 / 85%)';
const NO_IMAGES: ReadonlyMap<string, HTMLImageElement> = new Map();

/**
 * Draws the stickers on a frame of `size` px, clipped to the round frame like the photo. Used for the preview and
 * the export. An image sticker whose image is not (yet) loaded is left out.
 */
export function drawStickers(
  ctx: CanvasRenderingContext2D,
  size: number,
  stickers: readonly Sticker[],
  images: ReadonlyMap<string, HTMLImageElement> = NO_IMAGES,
): void {
  if (!stickers.length) {
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, outerRadius(size), 0, Math.PI * 2);
  ctx.clip();
  for (const s of stickers) {
    ctx.save();
    ctx.translate(s.x * size, s.y * size);
    ctx.rotate((s.rotation * Math.PI) / 180);
    if (s.image === undefined) {
      ctx.font = `${Math.round(s.size * size * GLYPH_RATIO)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.emoji, 0, 0);
    } else {
      drawImage(ctx, images.get(s.image), s.size * size * GLYPH_RATIO);
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Selection frame with the scale and rotate handles; preview only, never exported. Each line is drawn twice
 * (light outline, then `color`), so it stays visible on dark and light photos.
 */
export function drawSelection(
  ctx: CanvasRenderingContext2D,
  size: number,
  s: StickerGeometry,
  color: string,
): void {
  const lineWidth = Math.max(1, size / 240);
  const half = (s.size / 2) * size;
  const handles = handlePositions(s);
  const knob = { x: handles.rotate.x * size, y: handles.rotate.y * size };
  // the line to the rotate handle starts at the sticker edge
  const edgeRatio = s.size / 2 / (s.size / 2 + ROTATE_HANDLE_DISTANCE);
  const edge = {
    x: s.x * size + (knob.x - s.x * size) * edgeRatio,
    y: s.y * size + (knob.y - s.y * size) * edgeRatio,
  };

  for (const [stroke, width] of [
    [OUTLINE, lineWidth * 3],
    [color, lineWidth],
  ] as const) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(edge.x, edge.y);
    ctx.lineTo(knob.x, knob.y);
    ctx.stroke();
    ctx.translate(s.x * size, s.y * size);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.setLineDash(stroke === color ? [size / 60, size / 90] : []);
    ctx.strokeRect(-half, -half, half * 2, half * 2);
    ctx.restore();
  }

  const radius = HANDLE_RADIUS * size;
  drawHandle(
    ctx,
    handles.scale.x * size,
    handles.scale.y * size,
    radius,
    '#ffffff',
    color,
    lineWidth,
  );
  drawHandle(ctx, knob.x, knob.y, radius, color, '#ffffff', lineWidth);
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
  stroke: string,
  lineWidth: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth * 1.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** Dashed circle around a selected round badge (preview only), drawn twice like the sticker selection. */
export function drawCircleSelection(
  ctx: CanvasRenderingContext2D,
  size: number,
  circle: { readonly x: number; readonly y: number; readonly r: number },
  color: string,
): void {
  const lineWidth = Math.max(1, size / 240);
  for (const [stroke, width] of [
    [OUTLINE, lineWidth * 3],
    [color, lineWidth],
  ] as const) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.setLineDash(stroke === color ? [size / 60, size / 90] : []);
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.r + lineWidth * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** Centered in the sticker box, scaled to fit (the server only accepts square images, this keeps others intact). */
function drawImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  box: number,
): void {
  if (!image?.naturalWidth || !image.naturalHeight) {
    return;
  }
  const scale = Math.min(box / image.naturalWidth, box / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
}

/**
 * Dashed outline around a selected text on the ring (preview only): the part of the text band between
 * `center - half` and `center + half` degrees, with a little room.
 */
export function drawArcSelection(
  ctx: CanvasRenderingContext2D,
  size: number,
  g: Geometry,
  center: number,
  half: number,
  color: string,
): void {
  const lineWidth = Math.max(1, size / 240);
  const band = textBand(g);
  const from = ((center - half - 1 - 90) * Math.PI) / 180;
  const to = ((center + half + 1 - 90) * Math.PI) / 180;
  for (const [stroke, width] of [
    [OUTLINE, lineWidth * 3],
    [color, lineWidth],
  ] as const) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.setLineDash(stroke === color ? [size / 60, size / 90] : []);
    ctx.beginPath();
    ctx.arc(g.center, g.center, g.outer - lineWidth, from, to);
    ctx.arc(g.center, g.center, g.outer - band + lineWidth, to, from, true);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
