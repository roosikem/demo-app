import { round } from '../models/numbers';
import { Point, relativePoint } from '../models/pointer';
import { BadgeMove } from '../rendering/badge-position';

/** The round badge on a frame of size 1 (frame center 0.5 / 0.5), to find out if a press hits it. */
export interface BadgeCircle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** Callbacks into the editor. The gestures only report what the user does; the editor saves it. */
export interface BadgeGestureHost {
  /** the movable badge, or null when there is none (no round badge, feature off) */
  badge(): BadgeCircle | null;
  /** where the badge may go for a wanted center (the app's limits) */
  place(wanted: Point, move: BadgeMove): Point;
  selected(): boolean;
  select(selected: boolean): void;
  /** the center shown during a drag, or null when no drag is running */
  preview(at: Point | null): void;
  commit(at: Point): void;
}

interface Gesture {
  readonly pointerId: number;
  readonly from: Point;
  readonly start: Point;
  shown: Point;
  /** set once the pointer has left its first point; a click alone changes nothing */
  moved: boolean;
}

/** arrow key steps, fraction of the frame */
const KEY_STEP = 0.005;
const KEY_STEP_LARGE = 0.025;
const KEY_MOVES: Readonly<Record<string, Point>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * Mouse, touch and keyboard input for the round badge. While dragging, only a preview is shown; the new position is
 * saved once, when the pointer is released. A click only selects the badge.
 */
export class BadgeGestures {
  private gesture: Gesture | null = null;

  constructor(private readonly host: BadgeGestureHost) {}

  /** @returns true when the press hits the badge and starts a drag */
  pointerDown(event: PointerEvent, target: HTMLElement): boolean {
    this.cancel();
    const badge = this.host.badge();
    const p = relativePoint(event, target);
    if (!badge || Math.hypot(p.x - badge.x, p.y - badge.y) > badge.r) {
      if (this.host.selected()) {
        this.host.select(false);
      }
      return false;
    }
    // as stored (four decimals), so a tap that wobbles and comes back changes nothing
    const start = stored(badge);
    this.gesture = { pointerId: event.pointerId, from: p, start, shown: start, moved: false };
    this.host.select(true);
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
      // the grab point stays under the pointer, so the badge does not jump to it
      g.shown = this.host.place(
        {
          x: g.start.x + p.x - g.from.x,
          y: g.start.y + p.y - g.from.y,
        },
        { snap: true },
      );
      this.host.preview(g.shown);
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
    if (!samePoint(g.shown, g.start)) {
      this.host.commit(g.shown);
    }
    return true;
  }

  /** Escape ends a drag, otherwise the selection; the arrow keys move a selected badge. */
  keyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape') {
      if (!this.cancel() && !this.host.selected()) {
        return false;
      }
      this.host.select(false);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    const move = KEY_MOVES[event.key];
    const badge = this.host.badge();
    if (!move || !badge || !this.host.selected() || this.gesture) {
      return false;
    }
    // the keys belong to the selected badge, also at a limit, so the photo does not move
    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const from = stored(badge);
    const at = this.host.place({ x: from.x + move.x * step, y: from.y + move.y * step }, { from });
    if (!samePoint(at, from)) {
      this.host.commit(at);
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

function stored(p: Point): Point {
  return { x: round(p.x, 4), y: round(p.y, 4) };
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}
