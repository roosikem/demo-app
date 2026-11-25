import { Point, relativePoint } from '../models/pointer';
import { StickerCommand, stickerKeyCommand } from './sticker-commands';
import {
  Sticker,
  StickerHandle,
  clampSticker,
  handleAt,
  rotatedBy,
  sameGeometry,
  scaledBy,
  stickerAt,
} from './sticker.model';

/** Callbacks into the editor. The gestures only report what the user does; the editor saves it. */
export interface StickerGestureHost {
  stickers(): readonly Sticker[];
  selectedId(): string | null;
  select(id: string | null): void;
  /** The sticker as it is shown during a drag, or null when no drag is running. */
  preview(draft: Sticker | null): void;
  commit(command: StickerCommand): void;
}

// hit radius of the handles as a fraction of the frame; fingers need more room than a mouse
const HANDLE_HIT = { mouse: 0.04, touch: 0.07 } as const;
const ROTATE_SNAP_DEGREES = 15;

interface Gesture {
  readonly pointerId: number;
  readonly mode: 'move' | StickerHandle;
  /** pointer position when the gesture started */
  readonly from: Point;
  readonly start: Sticker;
}

/**
 * Mouse, touch and keyboard input for the stickers: move, resize with the corner handle, rotate with the round
 * handle. While dragging, only a preview is shown; the change is saved once, when the pointer is released.
 */
export class StickerGestures {
  private gesture: Gesture | null = null;

  constructor(private readonly host: StickerGestureHost) {}

  /** @returns true when the event starts a sticker gesture, false when the caller should handle it */
  pointerDown(event: PointerEvent, target: HTMLElement): boolean {
    this.cancel();
    const p = relativePoint(event, target);
    const stickers = this.host.stickers();
    const selected = stickers.find((s) => s.id === this.host.selectedId());
    const handle = selected ? handleAt(selected, p, hitRadius(event)) : null;
    const sticker = handle && selected ? selected : stickerAt(stickers, p);
    if (!sticker) {
      this.host.select(null);
      return false;
    }
    this.host.select(sticker.id);
    this.gesture = { pointerId: event.pointerId, mode: handle ?? 'move', from: p, start: sticker };
    target.setPointerCapture(event.pointerId);
    // the default action is prevented (no text selection), so the keyboard focus is set here
    event.preventDefault();
    target.focus({ preventScroll: true });
    return true;
  }

  pointerMove(event: PointerEvent, target: HTMLElement): boolean {
    const g = this.gesture;
    if (!g || g.pointerId !== event.pointerId) {
      return false;
    }
    this.host.preview(dragged(g, relativePoint(event, target), event.shiftKey));
    return true;
  }

  pointerUp(event: PointerEvent, target: HTMLElement): boolean {
    const g = this.gesture;
    if (!g || g.pointerId !== event.pointerId) {
      return false;
    }
    const result = dragged(g, relativePoint(event, target), event.shiftKey);
    this.cancel();
    if (!sameGeometry(g.start, result)) {
      const { x, y, size, rotation } = result;
      this.host.commit({ type: 'update', id: result.id, changes: { x, y, size, rotation } });
    }
    return true;
  }

  /** Ends a running gesture without changing anything (pointercancel, lost capture, feature switched off). */
  cancel(pointerId?: number): boolean {
    if (!this.gesture || (pointerId !== undefined && this.gesture.pointerId !== pointerId)) {
      return false;
    }
    this.gesture = null;
    this.host.preview(null);
    return true;
  }

  /** Keys for the selected sticker; Escape clears the selection. */
  keyDown(event: KeyboardEvent): boolean {
    const selected = this.host.stickers().find((s) => s.id === this.host.selectedId());
    if (!selected) {
      return false;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      this.host.select(null);
      return true;
    }
    const command = stickerKeyCommand(selected, event);
    if (!command) {
      return false;
    }
    event.preventDefault();
    this.host.commit(command);
    if (command.type === 'remove') {
      this.host.select(null);
    }
    return true;
  }
}

function dragged(g: Gesture, p: Point, snap: boolean): Sticker {
  switch (g.mode) {
    case 'scale':
      return scaledBy(g.start, g.from, p);
    case 'rotate':
      return rotatedBy(g.start, g.from, p, snap ? ROTATE_SNAP_DEGREES : 0);
    case 'move':
      return clampSticker({
        ...g.start,
        x: g.start.x + p.x - g.from.x,
        y: g.start.y + p.y - g.from.y,
      });
    default:
      return unknownMode(g.mode);
  }
}

function unknownMode(mode: never): never {
  throw new Error(`Unknown sticker gesture: ${String(mode)}`);
}

function hitRadius(event: PointerEvent): number {
  return event.pointerType === 'touch' ? HANDLE_HIT.touch : HANDLE_HIT.mouse;
}
