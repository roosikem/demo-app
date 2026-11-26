import { FrameConfig } from '../models/frame.model';
import { frameGeometry } from './frame-geometry';
import { fitText } from './text-metrics';
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

/** spans are fractions of the circle, so any size gives the same; this one measures precisely */
const MEASURE_SIZE = 1000;

/** Half the angle each text covers as drawn; 0 for an empty text. */
export function halfSpans(config: FrameConfig): number[] {
  const g = frameGeometry(MEASURE_SIZE, config);
  return config.texts.map((t) => (fitText(g, t)?.span ?? 0) / 2);
}

/** Free angles for the center of text `index`, or null when the other texts leave no room for it. */
export function freeTextRange(config: FrameConfig, index: number): AngleRange | null {
  const halves = halfSpans(config);
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
export function keepTextsApart(config: FrameConfig, moved: readonly number[]): FrameConfig {
  let result = config;
  for (const index of moved) {
    const range = freeTextRange(result, index);
    const center = result.texts[index].center;
    if (range && angleInRange(range, center) > range.max + EPSILON) {
      result = withTextAt(result, index, constrainAngle(range, center));
    }
  }
  return result;
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
