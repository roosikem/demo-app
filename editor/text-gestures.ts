import { clamp, signedDegrees } from '../models/numbers';
import { Point, angleFromTop, relativePoint } from '../models/pointer';
import {
  AngleRange,
  angleInRange,
  constrainAngle,
  readableDirection,
  storedAngle,
} from '../rendering/ring-gaps';

/** Callbacks into the editor. The gestures only report what the user does; the editor saves it. */
export interface TextGestureHost {
  /** the movable text at a point of the frame (0 .. 1), or null */
  textAt(p: Point): number | null;
  /** center of a movable text and its free range (0 .. 360 on a ring without other texts); null: not movable */
  text(index: number): { readonly center: number; readonly range: AngleRange } | null;
  selected(): number | null;
  select(index: number | null): void;
  /** the center shown during a drag, or null when no drag is running */
  preview(draft: { readonly index: number; readonly center: number } | null): void;
  commit(index: number, center: number): void;
}

interface Gesture {
  readonly pointerId: number;
  readonly index: number;
  readonly from: Point;
  readonly start: number;
  /** null on a free ring: the text goes round without an end */
  readonly range: AngleRange | null;
  /** pointer angle at the last event */
  pointer: number;
  /**
   * Center the pointer asks for, in the range's numbers and not limited to it: it follows every turn of the
   * pointer, so the text stays at the end it reached until the pointer comes back, and never jumps across.
   */
  wanted: number;
  shown: number;
  moved: boolean;
}

/** arrow key steps in degrees */
const KEY_STEP = 1;
const KEY_STEP_LARGE = 5;
/** visual direction of a key: right = clockwise in the upper half, counter-clockwise in the lower half */
const KEY_TURNS: Readonly<Partial<Record<string, number>>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: 0,
  ArrowDown: 0,
};

/**
 * Mouse, touch and keyboard input for the texts on the ring. While dragging, only a preview is shown; the new
 * position is saved once, when the pointer is released. A click only selects the text.
 */
export class TextGestures {
  private gesture: Gesture | null = null;

  constructor(private readonly host: TextGestureHost) {}

  /** @returns true when the press hits a text and starts a drag */
  pointerDown(event: PointerEvent, target: HTMLElement): boolean {
    this.cancel();
    const p = relativePoint(event, target);
    const index = this.host.textAt(p);
    const text = index === null ? null : this.host.text(index);
    if (index === null || !text) {
      if (this.host.selected() !== null) {
        this.host.select(null);
      }
      return false;
    }
    this.gesture = {
      pointerId: event.pointerId,
      index,
      from: p,
      start: text.center,
      range: limited(text.range),
      pointer: pointerAngle(p),
      wanted: angleInRange(text.range, text.center),
      shown: text.center,
      moved: false,
    };
    this.host.select(index);
    target.setPointerCapture(event.pointerId);
    event.preventDefault();
    target.focus({ preventScroll: true });
    return true;
  }

  pointerMove(event: PointerEvent, target: HTMLElement): boolean {
    const g = this.gesture;
    if (g?.pointerId !== event.pointerId) {
      return false;
    }
    const p = relativePoint(event, target);
    g.moved ||= p.x !== g.from.x || p.y !== g.from.y;
    if (g.moved) {
      const angle = pointerAngle(p);
      g.wanted += signedDegrees(angle - g.pointer);
      g.pointer = angle;
      g.shown = storedAngle(
        g.range,
        g.range ? clamp(g.wanted, g.range.min, g.range.max) : g.wanted,
      );
      this.host.preview({ index: g.index, center: g.shown });
    }
    return true;
  }

  pointerUp(event: PointerEvent, target: HTMLElement): boolean {
    if (this.gesture?.pointerId !== event.pointerId) {
      return false;
    }
    this.pointerMove(event, target);
    const g = this.gesture;
    this.cancel();
    // shown changes only when the pointer moved, so a click commits nothing
    if (g.shown !== g.start) {
      this.host.commit(g.index, g.shown);
    }
    return true;
  }

  /** Escape ends a drag, otherwise the selection; left / right move a selected text along the ring. */
  keyDown(event: KeyboardEvent): boolean {
    const selected = this.host.selected();
    if (event.key === 'Escape') {
      if (!this.cancel() && selected === null) {
        return false;
      }
      this.host.select(null);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    const direction = KEY_TURNS[event.key];
    const text = selected === null ? null : this.host.text(selected);
    if (direction === undefined || selected === null || !text || this.gesture) {
      return false;
    }
    // all arrow keys belong to the selected text (up / down do nothing), so the photo does not move
    event.preventDefault();
    const visual = readableDirection(text.center) === 'ccw' ? -direction : direction;
    const wanted = text.center + visual * (event.shiftKey ? KEY_STEP_LARGE : KEY_STEP);
    const range = limited(text.range);
    const center = storedAngle(range, range ? constrainAngle(range, wanted) : wanted);
    if (center !== text.center) {
      this.host.commit(selected, center);
    }
    return true;
  }

  /** Ends a running drag without changing anything (pointercancel, lost capture, feature switched off). */
  cancel(pointerId?: number): boolean {
    if (!this.gesture || (pointerId !== undefined && this.gesture.pointerId !== pointerId)) {
      return false;
    }
    this.gesture = null;
    this.host.preview(null);
    return true;
  }
}

/** null for the whole ring, which has no ends to stop at. */
function limited(range: AngleRange): AngleRange | null {
  return range.max - range.min >= 360 ? null : range;
}

/** 0 = straight above the center, clockwise, like the text centers. */
function pointerAngle(p: Point): number {
  return angleFromTop(p.x - 0.5, p.y - 0.5);
}
