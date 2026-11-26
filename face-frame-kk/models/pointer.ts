/** A position on the frame: 0 .. 1 from the left / top edge. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Degrees from straight up, clockwise, of the offset (dx, dy) on the screen. */
export function angleFromTop(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}
