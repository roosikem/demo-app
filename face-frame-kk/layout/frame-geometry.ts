import { FrameConfig } from '../models/frame.model';

// Radii of a frame on a square of `size` px. Saved designs store fractions, so these rules must stay the same as
// in the Canvas 2D version: a design looks the same in both.

/** keeps the anti-aliased edge inside the square */
const EDGE = 0.985;

export interface FrameGeometry {
  readonly center: number;
  readonly outer: number;
  /** inner edge of the ring; the outer radius without a ring */
  readonly inner: number;
  /** radius the photo is clipped to */
  readonly photo: number;
}

export function frameGeometry(size: number, config: FrameConfig): FrameGeometry {
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

/** Konva rotation (0 = 3 o'clock) of a frame angle (0 = top), both clockwise in degrees. */
export function konvaRotation(frameAngle: number): number {
  return frameAngle - 90;
}
