import Konva from './konva';
import { Circle, KonvaText, Line, Path, Star } from './konva';
import { BUBBLE_LAYOUT, bubblePlacement, solidRingColor } from '../layout/bubble-layout';
import { Badge, BadgeIcon, BubbleBadge, DiagonalBadge, FrameConfig } from '../models/frame.model';
import { FrameGeometry, konvaRotation } from '../layout/frame-geometry';
import { DEFAULT_FONT, middleOffsetY, textWidth } from '../layout/text-metrics';

// The badge as Konva nodes; its proportions are in layout/bubble-layout.ts.

const LINE_HEIGHT = 1.2;

export function badgeNode(g: FrameGeometry, config: FrameConfig, badge: Badge): Konva.Group {
  return badge.shape === 'bubble'
    ? bubbleNode(g, badge, config.photoBackground, solidRingColor(config.ring))
    : diagonalNode(g, badge);
}

function bubbleNode(
  g: FrameGeometry,
  b: BubbleBadge,
  gapColor: string,
  ringColor: string | null,
): Konva.Group {
  const { style, x, y, r, gapWidth } = bubblePlacement(g, b, ringColor);
  const layout = BUBBLE_LAYOUT[style];
  const group = new Konva.Group({ listening: false });
  if (gapWidth > 0) {
    group.add(new Circle({ x, y, radius: r + gapWidth, fill: gapColor }));
  }
  group.add(new Circle({ x, y, radius: r, fill: b.color }));
  if (style === 'joined' && g.inner < g.outer) {
    group.add(joinsNode(g, x, y, r, b.color));
  }
  group.add(
    ...lineNodes(b.lines, b.textColor, {
      x,
      y: y + r * layout.textOffset,
      maxWidth: r * layout.textWidth,
      size: r * layout.textSize,
      weight: layout.textWeight,
    }),
  );
  if (b.icon && b.icon !== 'none') {
    // a moved badge turns its icon to the frame edge in its direction from the center
    const a = b.at
      ? Math.atan2(y - g.center, x - g.center)
      : (konvaRotation(b.angle) * Math.PI) / 180;
    const ir = r * layout.iconRadius;
    const ia = a - layout.iconTurn;
    const ix = x + Math.cos(ia) * r * layout.iconOffset;
    const iy = y + Math.sin(ia) * r * layout.iconOffset;
    group.add(
      new Circle({
        x: ix,
        y: iy,
        radius: ir,
        fill: gapColor,
        stroke: b.color,
        strokeWidth: ir * 0.14,
      }),
      iconNode(b.icon, ix, iy, ir * 0.62, b.color),
    );
  }
  return group;
}

/**
 * Rounded joins between an attached badge and the ring, on both sides: the area between the badge, the inner
 * edge of the ring and a small circle touching both. Konva has no shape for this, so the path is drawn here.
 */
function joinsNode(
  g: FrameGeometry,
  bx: number,
  by: number,
  r: number,
  color: string,
): Konva.Shape {
  return new Konva.Shape({
    fill: color,
    sceneFunc: (ctx, shape) => {
      const c = g.center;
      const f = g.outer * 0.1;
      const d = Math.hypot(bx - c, by - c);
      const toRing = g.inner - f;
      const toBadge = r + f;
      // circle-circle intersection: centers of the small join circles
      const along = (toRing * toRing - toBadge * toBadge + d * d) / (2 * d);
      const across = Math.sqrt(toRing * toRing - along * along);
      if (!Number.isFinite(across) || d === 0) {
        return;
      }
      const ux = (bx - c) / d;
      const uy = (by - c) / d;
      const badgeAngle = Math.atan2(uy, ux);
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const fx = c + ux * along - uy * across * side;
        const fy = c + uy * along + ux * across * side;
        const start = Math.atan2(by - fy, bx - fx);
        const ringAngle = Math.atan2(fy - c, fx - c);
        ctx.moveTo(bx, by);
        ctx.lineTo(fx + Math.cos(start) * f, fy + Math.sin(start) * f);
        ctx.arc(fx, fy, f, start, ringAngle, shortestTurn(start, ringAngle) < 0);
        ctx.lineTo(c + Math.cos(ringAngle) * g.outer, c + Math.sin(ringAngle) * g.outer);
        ctx.arc(c, c, g.outer, ringAngle, badgeAngle, shortestTurn(ringAngle, badgeAngle) < 0);
        ctx.closePath();
      }
      ctx.fillShape(shape);
    },
  });
}

function diagonalNode(g: FrameGeometry, b: DiagonalBadge): Konva.Group {
  const { center: c, outer: R } = g;
  const s = b.scale ?? 1;
  // default position + growth, so the default size gives exactly the original coordinates
  const grow = s - 1;
  // the band is cut by the circle on purpose
  const group = new Konva.Group({
    listening: false,
    clipFunc: (ctx) => ctx.arc(c, c, R, 0, Math.PI * 2),
  });
  group.add(
    new Line({
      points: [
        c + R * 0.42 - R * 0.63 * grow,
        c - R * 1.05,
        c + R * 1.05,
        c - R * 1.05,
        c + R * 1.05,
        c + R * 1.05,
        c - R * 0.02 - R * 1.07 * grow,
        c + R * 1.05,
      ],
      closed: true,
      fill: b.color,
    }),
  );
  const x = c + R * 0.62 - R * 0.43 * grow;
  const titleSize = R * 0.3 * s;
  const titleFont = `800 ${titleSize}px ${DEFAULT_FONT}`;
  const letters = Array.from(b.title);
  const colors = b.titleColors?.length ? b.titleColors : [b.textColor];
  const widths = letters.map((l) => textWidth(l, titleFont));
  let cursor = x - widths.reduce((sum, w) => sum + w, 0) / 2;
  letters.forEach((letter, i) => {
    group.add(
      centeredText(
        letter,
        colors[i % colors.length],
        cursor + widths[i] / 2,
        c + R * 0.12,
        titleSize,
        800,
      ),
    );
    cursor += widths[i];
  });
  // the circle edge at y = 0.5R is x = 0.87R: a narrow band must not push the lines over it
  group.add(
    ...lineNodes(b.lines, b.textColor, {
      x,
      y: c + R * 0.5,
      maxWidth: Math.min(R * 0.42 * s, 2 * (c + R * 0.86 - x)),
      size: R * 0.11 * s,
      weight: 700,
    }),
  );
  return group;
}

/** Centered lines; a line wider than maxWidth gets a smaller font. */
function lineNodes(
  lines: readonly string[],
  color: string,
  box: { x: number; y: number; maxWidth: number; size: number; weight: number },
): KonvaText[] {
  const visible = lines.map((l) => l.trim()).filter(Boolean);
  const lineHeight = box.size * LINE_HEIGHT;
  const top = box.y - ((visible.length - 1) * lineHeight) / 2;
  return visible.map((line, i) => {
    const width = textWidth(line, `${box.weight} ${box.size}px ${DEFAULT_FONT}`);
    const size = width > box.maxWidth ? (box.size * box.maxWidth) / width : box.size;
    return centeredText(line, color, box.x, top + i * lineHeight, size, box.weight);
  });
}

/** A text centered on (x, y), like fillText with textAlign center and textBaseline middle. */
function centeredText(
  text: string,
  color: string,
  x: number,
  y: number,
  size: number,
  weight: number,
): KonvaText {
  const node = new KonvaText({
    text,
    x,
    y,
    fill: color,
    fontFamily: DEFAULT_FONT,
    fontStyle: String(weight),
    fontSize: size,
    lineHeight: 1,
  });
  node.offset({
    x: node.width() / 2,
    y: middleOffsetY(`${weight} ${size}px ${DEFAULT_FONT}`, size),
  });
  return node;
}

function iconNode(icon: BadgeIcon, x: number, y: number, s: number, color: string): Konva.Shape {
  const line = {
    x,
    y,
    stroke: color,
    strokeWidth: s * 0.18,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
  };
  switch (icon) {
    case 'star':
      return new Star({
        x,
        y,
        numPoints: 5,
        innerRadius: s * 0.45,
        outerRadius: s,
        fill: color,
      });
    case 'check':
      return new Line({
        ...line,
        points: [-s * 0.6, 0, -s * 0.15, s * 0.45, s * 0.65, -s * 0.45],
      });
    case 'heart':
      return new Path({
        x,
        y,
        fill: color,
        data:
          `M 0 ${s * 0.7} C ${-s * 1.1} ${-s * 0.1} ${-s * 0.5} ${-s * 0.9} 0 ${-s * 0.3} ` +
          `C ${s * 0.5} ${-s * 0.9} ${s * 1.1} ${-s * 0.1} 0 ${s * 0.7} Z`,
      });
    case 'cloud':
      return new Konva.Shape({
        ...line,
        sceneFunc: (ctx, shape) => {
          ctx.beginPath();
          ctx.arc(-s * 0.35, s * 0.1, s * 0.35, Math.PI * 0.5, Math.PI * 1.5);
          ctx.arc(s * 0.05, -s * 0.2, s * 0.45, Math.PI, Math.PI * 1.9);
          ctx.arc(s * 0.45, s * 0.1, s * 0.35, Math.PI * 1.5, Math.PI * 0.5);
          ctx.closePath();
          ctx.strokeShape(shape);
        },
      });
    case 'none':
      return new Konva.Shape({ visible: false });
  }
}

/** Signed smallest angle from a to b (-PI .. PI). */
function shortestTurn(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
