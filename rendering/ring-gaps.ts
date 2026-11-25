import { normalizeDegrees } from '../models/numbers';

// Free places on the ring: things on the ring (texts, symbols, a badge) block an angle range each; a moving one is
// kept inside the free gap it is in. Angles are degrees, 0 = top, clockwise.

/** Free angles, min <= max; min may be negative for a gap across the top (e.g. -40 .. 60). */
export interface AngleRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Two angles closer than this are the same. Ends of blocked parts go through modulo arithmetic, so an end that is
 * exactly a text's border can come back 1e-14 inside the text or 360 degrees away.
 */
export const EPSILON = 1e-9;
/** room kept between two things on the ring (badge and text, two texts), in degrees */
export const RING_MARGIN_DEGREES = 2;
/** a step next to an end, just beyond the tolerance */
const BESIDE = 1e-6;
const FULL_CIRCLE: AngleRange = { min: 0, max: 360 };

/** `wanted` kept inside the range, 0 .. 360: an angle inside comes back unchanged, one beyond goes to the nearer end. */
export function constrainAngle(range: AngleRange, wanted: number): number {
  const unwrapped = angleInRange(range, wanted);
  if (unwrapped <= range.max + EPSILON) {
    return normalizeDegrees(wanted);
  }
  const pastMax = unwrapped - range.max;
  const beforeMin = range.min + 360 - unwrapped;
  return normalizeDegrees(pastMax <= beforeMin ? range.max : range.min);
}

/** The angle in the range's numbers: in -40 .. 60, 350 is -10. */
export function angleInRange(range: AngleRange, angle: number): number {
  // whole turns are added to the angle, not offsets to range.min, so 10 stays exactly 10
  const a = normalizeDegrees(angle);
  return a + 360 * Math.ceil((range.min - EPSILON - a) / 360);
}

/**
 * The free gap that contains `angle`: from the end of the nearest blocked part counter-clockwise to the start of
 * the nearest one clockwise. A blocked `angle` is first moved to the nearest free end of a blocked part; when
 * nothing is free, null.
 */
export function gapAround(blocked: readonly AngleRange[], angle: number): AngleRange | null {
  if (!blocked.length) {
    return FULL_CIRCLE;
  }
  if (blocked.some((part) => part.max - part.min >= 360)) {
    return null;
  }
  const isBlocked = (a: number): boolean =>
    blocked.some((part) => {
      const offset = clockwiseDistance(part.min, a);
      return offset > EPSILON && offset < part.max - part.min - EPSILON;
    });
  let start = normalizeDegrees(angle);
  if (isBlocked(start)) {
    // no flatMap: the library has to compile with lib ES2016
    const ends = blocked.reduce<number[]>(
      (all, part) => all.concat(normalizeDegrees(part.min), normalizeDegrees(part.max)),
      [],
    );
    // the shared border of two parts that touch is not blocked, but it has no room on either side
    const roomy = (end: number): boolean =>
      !isBlocked(end) && (!isBlocked(end - BESIDE) || !isBlocked(end + BESIDE));
    const free = ends
      .filter(roomy)
      .sort((a, b) => circularDistance(a, start) - circularDistance(b, start));
    if (!free.length) {
      return null;
    }
    start = free[0];
  }
  const clockwise = Math.min(...blocked.map((part) => clockwiseDistance(start, part.min)));
  const counterClockwise = Math.min(...blocked.map((part) => clockwiseDistance(part.max, start)));
  return { min: start - counterClockwise, max: start + clockwise };
}

/** 0 .. 360 degrees clockwise from `from` to `to`; the same angle is 0, not 360. */
function clockwiseDistance(from: number, to: number): number {
  const d = normalizeDegrees(to - from);
  return d > 360 - EPSILON ? 0 : d;
}

function circularDistance(a: number, b: number): number {
  const d = clockwiseDistance(b, a);
  return Math.min(d, 360 - d);
}

/**
 * The angle as stored: one decimal, 0 .. 359.9, rounded towards the inside of the range, so a thing at the end of
 * its gap is not stored a twentieth of a degree over its neighbour.
 */
export function storedAngle(range: AngleRange | null, angle: number): number {
  if (!range) {
    return oneDecimal(angle);
  }
  const tenths = angleInRange(range, angle) * 10;
  const rounded = Math.round(tenths) / 10;
  if (rounded > range.max) {
    return oneDecimal(Math.floor(tenths) / 10);
  }
  return oneDecimal(rounded < range.min ? Math.ceil(tenths) / 10 : rounded);
}

function oneDecimal(angle: number): number {
  return normalizeDegrees(Math.round(normalizeDegrees(angle) * 10) / 10);
}

/** Clockwise in the upper half, counter-clockwise in the lower half, so a text reads upright wherever it is. */
export function readableDirection(center: number): 'cw' | 'ccw' {
  const a = normalizeDegrees(center);
  return a > 90 && a < 270 ? 'ccw' : 'cw';
}
