/** A position on the frame: 0 .. 1 from the left / top edge. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The pointer position on `target` as a fraction of its size. */
export function relativePoint(event: PointerEvent, target: HTMLElement): Point {
  const rect = target.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

/** Degrees from straight up, clockwise, of the offset (dx, dy) on the screen. */
export function angleFromTop(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}
