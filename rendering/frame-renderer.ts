import {
  ArcText,
  Badge,
  BadgeIcon,
  BubbleBadge,
  BubbleStyle,
  Decoration,
  DiagonalBadge,
  ExportFormat,
  FrameConfig,
  PhotoTransform,
  RingLayer,
} from '../models/frame.model';

// Canvas drawing of a frame. Used for the preview, the thumbnails and the exported images.

const TAU = Math.PI * 2;
// keeps the anti-aliased edge inside the canvas
const EDGE = 0.985;
const DEFAULT_FONT = 'Arial, sans-serif';

export function toCanvasAngle(deg: number): number {
  return ((deg - 90) * Math.PI) / 180;
}

export interface Geometry {
  readonly center: number;
  readonly outer: number;
  readonly inner: number;
  readonly photo: number;
}

export function geometry(size: number, config: FrameConfig): Geometry {
  const center = size / 2;
  const outer = center * EDGE;
  const inner = config.ring ? outer * (1 - config.ring.width) : outer;
  return {
    center,
    outer,
    inner,
    photo: config.photoClip === 'outer' || !config.ring ? outer : inner,
  };
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  config: FrameConfig,
  image: HTMLImageElement | null,
  photo: PhotoTransform,
  opaqueBackground?: string,
  stencilImage: HTMLImageElement | null = null,
): void {
  const g = geometry(size, config);
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  if (opaqueBackground) {
    // JPEG has no alpha channel
    ctx.fillStyle = opaqueBackground;
    ctx.fillRect(0, 0, size, size);
  }
  drawPhoto(ctx, g, config, image, photo);
  if (config.ring) {
    drawRing(ctx, g, config.ring);
  }
  if (stencilImage) {
    ctx.drawImage(stencilImage, 0, 0, size, size);
  }
  for (const d of config.decorations ?? []) {
    drawDecoration(ctx, g, d);
  }
  if (config.badge) {
    drawBadge(ctx, g, config.badge, config.photoBackground, solidRingColor(config.ring));
  }
  for (const t of config.texts) {
    drawArcText(ctx, g, t);
  }
  ctx.restore();
}

export function renderToBlob(
  config: FrameConfig,
  image: HTMLImageElement,
  photo: PhotoTransform,
  size: number,
  format: ExportFormat,
  stencilImage: HTMLImageElement | null = null,
  quality = 0.92,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Canvas 2D is not available'));
  }
  renderFrame(
    ctx,
    size,
    config,
    image,
    photo,
    format === 'image/jpeg' ? '#ffffff' : undefined,
    stencilImage,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image export failed'))),
      format,
      quality,
    ),
  );
}

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  config: FrameConfig,
  image: HTMLImageElement | null,
  p: PhotoTransform,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(g.center, g.center, g.photo, 0, TAU);
  ctx.clip();
  ctx.fillStyle = config.photoBackground;
  ctx.fill();
  if (image) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width > 0 && height > 0) {
      const diameter = g.photo * 2;
      // cover fit, then the user's zoom
      const scale = (diameter / Math.min(width, height)) * p.zoom;
      ctx.translate(g.center + p.offsetX * diameter, g.center + p.offsetY * diameter);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.drawImage(image, -width / 2, -height / 2);
    }
  }
  ctx.restore();
}

function drawRing(ctx: CanvasRenderingContext2D, g: Geometry, ring: RingLayer): void {
  const start = ring.arc ? toCanvasAngle(ring.arc.start) : 0;
  const end = ring.arc ? toCanvasAngle(ring.arc.end) : TAU;
  ctx.save();
  if (ring.fill.type === 'segments') {
    const colors = ring.fill.colors;
    const step = (end - start) / colors.length;
    colors.forEach((color, i) => {
      annulus(ctx, g, start + i * step, start + (i + 1) * step + 0.004);
      ctx.fillStyle = color;
      ctx.fill();
    });
  } else {
    annulus(ctx, g, start, end);
    ctx.fillStyle =
      ring.fill.type === 'solid'
        ? ring.fill.color
        : (conic(ctx, g, ring.fill.colors, start, end) ?? ring.fill.colors[0] ?? 'transparent');
    ctx.fill();
  }
  if (ring.innerLine) {
    ctx.beginPath();
    ctx.arc(g.center, g.center, g.inner + (ring.innerLine.width * g.outer) / 2, start, end);
    ctx.lineWidth = ring.innerLine.width * g.outer;
    ctx.strokeStyle = ring.innerLine.color;
    ctx.stroke();
  }
  ctx.restore();
}

function annulus(ctx: CanvasRenderingContext2D, g: Geometry, start: number, end: number): void {
  ctx.beginPath();
  ctx.arc(g.center, g.center, g.outer, start, end);
  ctx.arc(g.center, g.center, g.inner, end, start, true);
  ctx.closePath();
}

function conic(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  colors: readonly string[],
  start: number,
  end: number,
): CanvasGradient | null {
  // older browsers without conic gradients get the first colour
  if (colors.length === 0 || typeof ctx.createConicGradient !== 'function') {
    return null;
  }
  const gradient = ctx.createConicGradient(start, g.center, g.center);
  const span = (end - start) / TAU;
  // repeat the first colour on a full ring to avoid a seam
  const stops = span >= 1 && colors.length > 1 ? [...colors, colors[0]] : colors;
  stops.forEach((c, i) =>
    gradient.addColorStop(Math.min(1, (span * i) / Math.max(1, stops.length - 1)), c),
  );
  return gradient;
}

// Largest font size <= maxFont so the text fits into maxSpan (radians). Width scales linearly with the size.
export function fitFontSize(
  measure: (fontSize: number) => number,
  radius: number,
  maxSpan: number,
  maxFont: number,
): number {
  const width = measure(maxFont);
  if (width <= 0 || radius <= 0) {
    return maxFont;
  }
  const span = width / radius;
  return span <= maxSpan ? maxFont : maxFont * (maxSpan / span);
}

function drawArcText(ctx: CanvasRenderingContext2D, g: Geometry, t: ArcText): void {
  const text = t.text.trim();
  if (!text) {
    return;
  }
  const band = g.outer - g.inner || g.outer * 0.16;
  const radius = g.outer - band / 2;
  const family = t.fontFamily ?? DEFAULT_FONT;
  const weight = t.fontWeight ?? 700;
  const spacing = t.letterSpacing ?? 0.04;
  const chars = Array.from(text);
  const widthAt = (size: number): number => {
    ctx.font = `${weight} ${size}px ${family}`;
    return chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing * size, 0);
  };
  const maxSpan = ((t.maxSpan ?? 150) * Math.PI) / 180;
  const fontSize = fitFontSize(widthAt, radius, maxSpan, band * 0.62);

  ctx.save();
  ctx.font = `${weight} ${fontSize}px ${family}`;
  ctx.fillStyle = t.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const widths = chars.map((ch) => ctx.measureText(ch).width + spacing * fontSize);
  const total = widths.reduce((a, b) => a + b, 0) / radius;
  const center = (t.center * Math.PI) / 180;
  const sign = t.direction === 'cw' ? 1 : -1;
  let travelled = 0;
  chars.forEach((ch, i) => {
    const angle = center - (sign * total) / 2 + (sign * (travelled + widths[i] / 2)) / radius;
    travelled += widths[i];
    ctx.save();
    ctx.translate(g.center, g.center);
    ctx.rotate(angle);
    ctx.translate(0, -radius);
    if (t.direction === 'ccw') {
      ctx.rotate(Math.PI);
    }
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

function drawDecoration(ctx: CanvasRenderingContext2D, g: Geometry, d: Decoration): void {
  const band = g.outer - g.inner;
  const radius = g.outer - band / 2;
  const a = toCanvasAngle(d.angle);
  ctx.save();
  ctx.translate(g.center + Math.cos(a) * radius, g.center + Math.sin(a) * radius);
  ctx.rotate(a + Math.PI / 2);
  ctx.font = `700 ${band * 0.62}px ${DEFAULT_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = d.color;
  ctx.fillText(d.symbol, 0, 0);
  ctx.restore();
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  badge: Badge,
  gap: string,
  ringColor: string | null,
): void {
  ctx.save();
  if (badge.shape === 'bubble') {
    drawBubble(ctx, g, badge, gap, ringColor);
  } else {
    // the diagonal segment is cut by the circle on purpose
    ctx.beginPath();
    ctx.arc(g.center, g.center, g.outer, 0, TAU);
    ctx.clip();
    drawDiagonal(ctx, g, badge);
  }
  ctx.restore();
}

/** Proportions per bubble style (radius relative to the frame, the rest relative to the badge). */
const BUBBLE_LAYOUT: Record<
  BubbleStyle,
  {
    radius: number;
    gap: number;
    textSize: number;
    textWeight: number;
    textOffset: number;
    textWidth: number;
    iconRadius: number;
    iconOffset: number;
    iconTurn: number;
  }
> = {
  floating: {
    radius: 0.34,
    gap: 0.02,
    textSize: 0.3,
    textWeight: 700,
    textOffset: 0.08,
    textWidth: 1.4,
    iconRadius: 0.32,
    iconOffset: 0.82,
    iconTurn: Math.PI / 2,
  },
  joined: {
    radius: 0.34,
    gap: 0,
    textSize: 0.27,
    textWeight: 700,
    textOffset: 0.08,
    textWidth: 1.4,
    iconRadius: 0.36,
    iconOffset: 0.95,
    iconTurn: 1.35,
  },
  flush: {
    radius: 0.3275,
    gap: 0,
    textSize: 0.26,
    textWeight: 600,
    textOffset: 0,
    textWidth: 1.75,
    iconRadius: 0.3,
    iconOffset: 0.81,
    iconTurn: 1.34,
  },
};

function drawBubble(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  b: BubbleBadge,
  gap: string,
  ringColor: string | null,
): void {
  const sameColour = ringColor?.toLowerCase() === b.color.toLowerCase() && g.inner < g.outer;
  const style: BubbleStyle = b.style ?? (sameColour ? 'joined' : 'floating');
  const layout = BUBBLE_LAYOUT[style];
  const a = toCanvasAngle(b.angle);
  const r = g.outer * layout.radius;
  const gapWidth = g.outer * layout.gap;
  // inside the frame (touching the outer edge unless floating), so the badge stays a full circle
  const distance = g.outer - r - gapWidth;
  const x = g.center + Math.cos(a) * distance;
  const y = g.center + Math.sin(a) * distance;
  if (gapWidth > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r + gapWidth, 0, TAU);
    ctx.fillStyle = gap;
    ctx.fill();
  }
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  if (style === 'joined' && g.inner < g.outer) {
    drawBubbleJoins(ctx, g, x, y, r);
  }
  fillLines(
    ctx,
    b.lines,
    b.textColor,
    x,
    y + r * layout.textOffset,
    r * layout.textWidth,
    r * layout.textSize,
    layout.textWeight,
  );
  if (b.icon && b.icon !== 'none') {
    const ir = r * layout.iconRadius;
    // turned towards the ring, so the icon stays inside the frame for any badge angle
    const ia = a - layout.iconTurn;
    const ix = x + Math.cos(ia) * r * layout.iconOffset;
    const iy = y + Math.sin(ia) * r * layout.iconOffset;
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, TAU);
    ctx.fillStyle = gap;
    ctx.fill();
    ctx.lineWidth = ir * 0.14;
    ctx.strokeStyle = b.color;
    ctx.stroke();
    drawIcon(ctx, b.icon, ix, iy, ir * 0.62, b.color);
  }
}

/**
 * Rounded joins between an attached badge and the ring (both sides). Each join is the area between the badge,
 * the inner edge of the ring and a small circle touching both. Uses the current fillStyle.
 */
function drawBubbleJoins(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  bx: number,
  by: number,
  r: number,
): void {
  const c = g.center;
  const f = g.outer * 0.1;
  const d = Math.hypot(bx - c, by - c);
  const toRing = g.inner - f;
  const toBadge = r + f;
  // circle-circle intersection: centres of the small join circles
  const along = (toRing * toRing - toBadge * toBadge + d * d) / (2 * d);
  const across = Math.sqrt(toRing * toRing - along * along);
  if (!Number.isFinite(across) || d === 0) {
    return;
  }
  const ux = (bx - c) / d;
  const uy = (by - c) / d;
  const badgeAngle = Math.atan2(uy, ux);
  for (const side of [-1, 1]) {
    const fx = c + ux * along - uy * across * side;
    const fy = c + uy * along + ux * across * side;
    const toBadgeAngle = Math.atan2(by - fy, bx - fx);
    const ringAngle = Math.atan2(fy - c, fx - c);
    // tangent points: towards the badge centre, and away from the frame centre (inner edge of the ring)
    const start = toBadgeAngle;
    const end = ringAngle;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(fx + Math.cos(start) * f, fy + Math.sin(start) * f);
    ctx.arc(fx, fy, f, start, end, shortestTurn(start, end) < 0);
    ctx.lineTo(c + Math.cos(ringAngle) * g.outer, c + Math.sin(ringAngle) * g.outer);
    ctx.arc(c, c, g.outer, ringAngle, badgeAngle, shortestTurn(ringAngle, badgeAngle) < 0);
    ctx.closePath();
    ctx.fill();
  }
}

/** Signed smallest angle from a to b (-PI .. PI). */
function shortestTurn(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

function solidRingColor(ring: FrameConfig['ring']): string | null {
  return ring?.fill.type === 'solid' ? ring.fill.color : null;
}

function drawDiagonal(ctx: CanvasRenderingContext2D, g: Geometry, b: DiagonalBadge): void {
  const { center: c, outer: R } = g;
  ctx.beginPath();
  ctx.moveTo(c + R * 0.42, c - R * 1.05);
  ctx.lineTo(c + R * 1.05, c - R * 1.05);
  ctx.lineTo(c + R * 1.05, c + R * 1.05);
  ctx.lineTo(c - R * 0.02, c + R * 1.05);
  ctx.closePath();
  ctx.fillStyle = b.color;
  ctx.fill();

  const x = c + R * 0.62;
  const titleSize = R * 0.3;
  ctx.font = `800 ${titleSize}px ${DEFAULT_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letters = Array.from(b.title);
  const colors = b.titleColors?.length ? b.titleColors : [b.textColor];
  const widths = letters.map((l) => ctx.measureText(l).width);
  let cursor = x - widths.reduce((s, w) => s + w, 0) / 2;
  letters.forEach((l, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillText(l, cursor + widths[i] / 2, c + R * 0.12);
    cursor += widths[i];
  });
  // circle edge at y = 0.5R is x = 0.87R
  fillLines(ctx, b.lines, b.textColor, x, c + R * 0.5, R * 0.42, R * 0.11);
}

function fillLines(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  color: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  weight = 700,
): void {
  const visible = lines.map((l) => l.trim()).filter(Boolean);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineHeight = size * 1.2;
  const top = y - ((visible.length - 1) * lineHeight) / 2;
  visible.forEach((line, i) => {
    ctx.font = `${weight} ${size}px ${DEFAULT_FONT}`;
    const w = ctx.measureText(line).width;
    const fitted = w > maxWidth ? (size * maxWidth) / w : size;
    ctx.font = `${weight} ${fitted}px ${DEFAULT_FONT}`;
    ctx.fillText(line, x, top + i * lineHeight);
  });
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  icon: BadgeIcon,
  x: number,
  y: number,
  s: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.18;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (icon) {
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s : s * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'check':
      ctx.moveTo(-s * 0.6, 0);
      ctx.lineTo(-s * 0.15, s * 0.45);
      ctx.lineTo(s * 0.65, -s * 0.45);
      ctx.stroke();
      break;
    case 'heart':
      ctx.moveTo(0, s * 0.7);
      ctx.bezierCurveTo(-s * 1.1, -s * 0.1, -s * 0.5, -s * 0.9, 0, -s * 0.3);
      ctx.bezierCurveTo(s * 0.5, -s * 0.9, s * 1.1, -s * 0.1, 0, s * 0.7);
      ctx.fill();
      break;
    case 'cloud':
      ctx.arc(-s * 0.35, s * 0.1, s * 0.35, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(s * 0.05, -s * 0.2, s * 0.45, Math.PI, Math.PI * 1.9);
      ctx.arc(s * 0.45, s * 0.1, s * 0.35, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'none':
      break;
  }
  ctx.restore();
}

/** WCAG contrast ratio of two #rrggbb colours, 21 if a colour cannot be parsed. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) {
    return 21;
  }
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1], 16);
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}
