/** Limits a number to min .. max; NaN and infinities give `fallback` (default: min). */
export function clamp(value: number, min: number, max: number, fallback = min): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Rounds to a fixed number of decimals, so values survive a save and restore unchanged. */
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** An angle in degrees as 0 <= a < 360. */
export function normalizeDegrees(angle: number): number {
  const a = angle % 360;
  if (a >= 0) {
    return a + 0; // -0 becomes 0
  }
  // -1e-15 + 360 is exactly 360
  return a + 360 === 360 ? 0 : a + 360;
}

/** An angle in degrees as -180 < a <= 180. */
export function signedDegrees(angle: number): number {
  const a = normalizeDegrees(angle);
  return a > 180 ? a - 360 : a;
}
