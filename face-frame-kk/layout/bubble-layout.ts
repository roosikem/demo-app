import { BubbleBadge, BubbleStyle, FrameConfig } from '../models/frame.model';
import { FrameGeometry, konvaRotation } from './frame-geometry';

// Size and place of the round badge. Sizes are fractions of the frame or of the badge, the same as in the Canvas 2D
// version, so a saved design looks the same. The drawing and the move rules both use it.

/** A moved badge this close to its place at the ring edge (fraction of the frame radius) counts as on the edge. */
export const ON_EDGE_TOLERANCE = 0.002;

interface BubbleLayout {
  readonly radius: number;
  readonly gap: number;
  readonly textSize: number;
  readonly textWeight: number;
  readonly textOffset: number;
  readonly textWidth: number;
  readonly iconRadius: number;
  readonly iconOffset: number;
  /** radians the icon sits from the ring direction */
  readonly iconTurn: number;
}

/** radius relative to the frame, the rest relative to the badge */
export const BUBBLE_LAYOUT: Readonly<Record<BubbleStyle, BubbleLayout>> = {
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

export interface BubblePlacement {
  readonly style: BubbleStyle;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly gapWidth: number;
}

export function solidRingColor(ring: FrameConfig['ring']): string | null {
  return ring?.fill.type === 'solid' ? ring.fill.color : null;
}

/** Where a round badge is drawn; also used to hit-test and drag it. */
export function bubblePlacement(
  g: FrameGeometry,
  b: BubbleBadge,
  ringColor: string | null,
): BubblePlacement {
  const sameColor = ringColor?.toLowerCase() === b.color.toLowerCase() && g.inner < g.outer;
  const style: BubbleStyle = b.style ?? (sameColor ? 'joined' : 'floating');
  const layout = BUBBLE_LAYOUT[style];
  const r = g.outer * layout.radius * (b.scale ?? 1);
  const gapWidth = g.outer * layout.gap;
  // inside the frame (touching the outer edge unless floating), so the badge stays a full circle
  const distance = g.outer - r - gapWidth;
  if (b.at) {
    const x = b.at.x * g.center * 2;
    const y = b.at.y * g.center * 2;
    const onEdge =
      Math.abs(Math.hypot(x - g.center, y - g.center) - distance) <= g.outer * ON_EDGE_TOLERANCE;
    return onEdge || style === 'floating'
      ? { style, x, y, r, gapWidth }
      : { style: 'floating', x, y, r, gapWidth: g.outer * BUBBLE_LAYOUT.floating.gap };
  }
  const a = (konvaRotation(b.angle) * Math.PI) / 180;
  return {
    style,
    x: g.center + Math.cos(a) * distance,
    y: g.center + Math.sin(a) * distance,
    r,
    gapWidth,
  };
}
