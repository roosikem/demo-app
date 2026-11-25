import { FrameConfig } from '../models/frame.model';
import { signedDegrees } from '../models/numbers';
import { Point, angleFromTop } from '../models/pointer';
import { MEASURE_SIZE, arcTextSpan, geometry, textBand } from './frame-renderer';
import {
  AngleRange,
  EPSILON,
  RING_MARGIN_DEGREES,
  angleInRange,
  constrainAngle,
  gapAround,
  readableDirection,
} from './ring-gaps';

// Texts on the ring can be moved along it. Two texts never overlap: a moved text keeps a small gap to the others.
// Angles are degrees, 0 = top, clockwise, like everywhere in the frame model.

/** a press this close to a text (degrees beyond its ends) still grabs it */
const HIT_SLACK_DEGREES = 3;

/** Free angles for the center of text `index`, or null when the other texts leave no room for it. */
export function freeTextRange(
  ctx: CanvasRenderingContext2D,
  config: FrameConfig,
  index: number,
): AngleRange | null {
  const halves = halfSpans(ctx, config);
  const blocked: AngleRange[] = [];
  config.texts.forEach((t, i) => {
    if (i !== index && halves[i] > 0) {
      const reach = halves[i] + halves[index] + RING_MARGIN_DEGREES;
      blocked.push({ min: t.center - reach, max: t.center + reach });
    }
  });
  return gapAround(blocked, config.texts[index].center);
}

/**
 * The config with the `moved` texts kept off the others (e.g. after a text got longer). Texts that were not moved
 * stay as designed; the same config comes back when nothing had to change.
 */
export function keepTextsApart(
  ctx: CanvasRenderingContext2D,
  config: FrameConfig,
  moved: readonly number[],
): FrameConfig {
  let result = config;
  for (const index of moved) {
    const range = freeTextRange(ctx, result, index);
    const center = result.texts[index].center;
    if (range && angleInRange(range, center) > range.max + EPSILON) {
      result = withTextAt(result, index, constrainAngle(range, center));
    }
  }
  return result;
}

/** The text at `p` (0 .. 1 of the frame): in the text band and within the text's ends; null for none. */
export function textAt(
  ctx: CanvasRenderingContext2D,
  config: FrameConfig,
  p: Point,
): number | null {
  const g = geometry(1, config);
  const band = textBand(g);
  const distance = Math.hypot(p.x - g.center, p.y - g.center);
  if (distance < g.outer - band || distance > g.outer) {
    return null;
  }
  const angle = angleFromTop(p.x - g.center, p.y - g.center);
  const halves = halfSpans(ctx, config);
  // the text under the pointer; near the end of a text, the nearest one within a few degrees
  let found: number | null = null;
  let best = Infinity;
  config.texts.forEach((t, i) => {
    const beyond = Math.abs(signedDegrees(angle - t.center)) - halves[i];
    if (halves[i] > 0 && beyond <= HIT_SLACK_DEGREES && Math.max(beyond, 0) < best) {
      found = i;
      best = Math.max(beyond, 0);
    }
  });
  return found;
}

/** Center and half the angle of one text, for the selection outline. */
export function textArc(
  ctx: CanvasRenderingContext2D,
  config: FrameConfig,
  index: number,
): { center: number; half: number } {
  return { center: config.texts[index].center, half: halfSpans(ctx, config)[index] };
}

/** The text moved to `center`, turned so it reads upright there. */
export function withTextAt(config: FrameConfig, index: number, center: number): FrameConfig {
  return {
    ...config,
    texts: config.texts.map((t, i) =>
      i === index ? { ...t, center, direction: readableDirection(center) } : t,
    ),
  };
}

/** Half the angle each text covers as drawn; 0 for an empty text. */
function halfSpans(ctx: CanvasRenderingContext2D, config: FrameConfig): number[] {
  const g = geometry(MEASURE_SIZE, config);
  return config.texts.map((t) => arcTextSpan(ctx, g, t) / 2);
}
