import { BadgePosition, BubbleBadge, FrameConfig } from '../models/frame.model';
import { clamp, normalizeDegrees, round } from '../models/numbers';
import { angleFromTop } from '../models/pointer';
import {
  AngleRange,
  EPSILON,
  RING_MARGIN_DEGREES,
  angleInRange,
  constrainAngle,
  gapAround,
} from './ring-gaps';
import {
  Geometry,
  arcTextSpan,
  ON_EDGE_TOLERANCE,
  bubblePlacement,
  decorationSpan,
  geometry,
  solidRingColor,
  textBand,
  MEASURE_SIZE,
} from './frame-renderer';

// A round badge can be moved anywhere on the frame. Where it may go is up to the app: by default it stays inside
// the round frame and may cover texts (the user decides); optionally it is kept off the texts and symbols on the
// ring. Angles are degrees, 0 = top, clockwise, like everywhere in the frame model.

export type RoundBadgeFrame = FrameConfig & { badge: BubbleBadge };

export interface BadgeLimits {
  readonly restrictInsideFrame: boolean;
  readonly restrictOnText: boolean;
}

/** room left inside the texts when the badge is moved towards the center, fraction of the frame radius */
const MARGIN_INSIDE = 0.01;
/**
 * A dragged badge this close to its place at the ring edge (fraction of the frame radius) is put on the edge. Must be
 * larger than the floating gap (0.02): between the floating limit and the edge only the edge itself fits.
 */
const SNAP = 0.03;
/** a stored place (four decimals) may lie this far beyond the floating limit, in px of MEASURE_SIZE */
const FIT_TOLERANCE = 0.1;
/**
 * A wish the limits move by less than this (px of MEASURE_SIZE) is kept as it is: a stored place is only rounded
 * (up to 0.07 px), so placing it again must not move it.
 */
const STILL = 0.15;

export function isRoundBadge(config: FrameConfig): config is RoundBadgeFrame {
  return config.badge?.shape === 'bubble';
}

/** Center of the badge at its designed place on the ring, 0 .. 1 of the frame. */
export function designedBadgePosition(config: RoundBadgeFrame): BadgePosition {
  const { x, y } = bubblePlacement(
    geometry(1, config),
    designed(config),
    solidRingColor(config.ring),
  );
  return { x, y };
}

/** How the badge is being moved: dragged (snaps to the ring edge) or by a key step from `from`. */
export interface BadgeMove {
  readonly snap?: boolean;
  readonly from?: BadgePosition;
}

/**
 * Where the badge ends up when the user moves its center to `wanted` (0 .. 1 of the frame, four decimals):
 * - while dragging (`snap`), close to the ring edge it snaps onto the edge
 * - with `restrictInsideFrame` it stays inside the frame
 * - with `restrictOnText` it moves off a text to the nearest free place (along the ring or inwards)
 */
export function placeBadge(
  ctx: CanvasRenderingContext2D | null,
  config: RoundBadgeFrame,
  wanted: BadgePosition,
  limits: BadgeLimits,
  move: BadgeMove = {},
): BadgePosition {
  const g = geometry(MEASURE_SIZE, config);
  const ring = solidRingColor(config.ring);
  const onEdge = bubblePlacement(g, designed(config), ring);
  const edge = Math.hypot(onEdge.x - g.center, onEdge.y - g.center);
  // any place off the edge: the badge is drawn floating there
  const offEdge = bubblePlacement(g, { ...config.badge, at: { x: 0.5, y: 0.5 } }, ring);
  const onTheEdge = (d: number): boolean => Math.abs(d - edge) <= g.outer * ON_EDGE_TOLERANCE;

  const x = wanted.x * MEASURE_SIZE - g.center;
  const y = wanted.y * MEASURE_SIZE - g.center;
  const asked = {
    distance: Math.hypot(x, y),
    angle: normalizeDegrees(angleFromTop(x, y)),
  };
  let { distance, angle } = asked;
  if (move.snap && Math.abs(distance - edge) <= g.outer * SNAP) {
    distance = edge;
  }
  if (limits.restrictInsideFrame) {
    distance = Math.min(distance, edge);
    if (!onTheEdge(distance)) {
      distance = insideFrame(distance, edge, g.outer - offEdge.r - offEdge.gapWidth, move);
    }
  }
  if (limits.restrictOnText && ctx) {
    // as the renderer decides: on the edge the badge keeps its style, elsewhere it floats with a gap
    const radiusAt = (d: number): number =>
      onTheEdge(d) ? onEdge.r + onEdge.gapWidth : offEdge.r + offEdge.gapWidth;
    [distance, angle] = offTheTexts(ctx, g, config, distance, angle, radiusAt);
  }
  const turn = ((angle - asked.angle) * Math.PI) / 180;
  const moved = Math.sqrt(
    distance ** 2 + asked.distance ** 2 - 2 * distance * asked.distance * Math.cos(turn),
  );
  // the center stays on the canvas, also when the badge may leave the frame
  if (moved <= STILL) {
    return { x: round(clamp(wanted.x, 0, 1), 4), y: round(clamp(wanted.y, 0, 1), 4) };
  }
  const a = (angle * Math.PI) / 180;
  return {
    x: round(clamp((g.center + Math.sin(a) * distance) / MEASURE_SIZE, 0, 1), 4),
    y: round(clamp((g.center - Math.cos(a) * distance) / MEASURE_SIZE, 0, 1), 4),
  };
}

/**
 * A distance at which the whole badge is inside the frame. A floating badge fits up to `floating`; a joined or flush
 * one also exactly at its `edge` (no gap there), but not in between, where it would float with its gap outside.
 */
function insideFrame(distance: number, edge: number, floating: number, move: BadgeMove): number {
  if (distance <= floating + FIT_TOLERANCE) {
    return distance;
  }
  if (distance >= edge || move.snap) {
    return edge;
  }
  if (move.from) {
    // a key step: outwards onto the edge, inwards off it
    const from = Math.hypot(move.from.x - 0.5, move.from.y - 0.5) * MEASURE_SIZE;
    return distance > from ? edge : floating;
  }
  return edge - distance < distance - floating ? edge : floating;
}

/** The nearest place, as [distance, angle], where the badge covers no text or symbol; the same one if it is free. */
function offTheTexts(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  config: RoundBadgeFrame,
  distance: number,
  angle: number,
  radiusAt: (distance: number) => number,
): [number, number] {
  const items = [
    ...config.texts.map((t) => ({ center: t.center, half: arcTextSpan(ctx, g, t) / 2 })),
    ...(config.decorations ?? []).map((d) => ({
      center: d.angle,
      half: decorationSpan(ctx, g, d) / 2,
    })),
  ].filter((item) => item.half > 0);
  const blockedAt = (d: number): AngleRange[] => {
    const covered = coveredHalfAngle(g, d, radiusAt(d));
    return covered > 0
      ? items.map(({ center, half }) => ({
          min: center - half - covered - RING_MARGIN_DEGREES,
          max: center + half + covered + RING_MARGIN_DEGREES,
        }))
      : [];
  };

  const along = gapAround(blockedAt(distance), angle);
  if (along && angleInRange(along, angle) <= along.max + EPSILON) {
    return [distance, angle];
  }
  const candidates: [number, number][] = [];
  if (along) {
    candidates.push([distance, constrainAngle(along, angle)]);
  }
  const inside = g.outer - textBand(g) - radiusAt(0) - g.outer * MARGIN_INSIDE;
  if (inside >= 0 && inside < distance) {
    candidates.push([inside, angle]);
  }
  const away = ([d, a]: [number, number]): number => {
    const turn = ((a - angle) * Math.PI) / 180;
    return d * d + distance * distance - 2 * d * distance * Math.cos(turn);
  };
  candidates.sort((p, q) => away(p) - away(q));
  return candidates[0] ?? [distance, angle];
}

/**
 * Half the angle, seen from the center of the frame, in which a circle at `distance` overlaps the band the texts
 * are drawn in; 0 when it does not reach the band. The widest point is where a line from the center touches the
 * circle, unless that lies outside the band.
 */
function coveredHalfAngle(g: Geometry, distance: number, radius: number): number {
  const inner = g.outer - textBand(g);
  if (distance - radius >= g.outer || distance + radius <= inner) {
    return 0;
  }
  if (distance <= radius) {
    return 180;
  }
  const touching = Math.sqrt(distance ** 2 - radius ** 2);
  const at = clamp(
    touching,
    Math.max(inner, distance - radius),
    Math.min(g.outer, distance + radius),
  );
  const cos = (distance ** 2 + at ** 2 - radius ** 2) / (2 * distance * at);
  return (Math.acos(clamp(cos, -1, 1)) * 180) / Math.PI;
}

/** The badge at its designed place, also when the config already has a moved one. */
function designed(config: RoundBadgeFrame): BubbleBadge {
  return { ...config.badge, at: undefined };
}
