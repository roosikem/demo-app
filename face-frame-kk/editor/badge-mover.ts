import { Signal, computed, effect, signal, untracked } from '@angular/core';
import { BadgePosition, FrameConfig, Stencil } from '../models/frame.model';
import { round } from '../models/numbers';
import {
  BadgeMove,
  designedBadgePosition,
  isRoundBadge,
  placeBadge,
  withBadgeAt,
} from '../layout/badge-placement';
import { bubblePlacement, solidRingColor } from '../layout/bubble-layout';
import { frameGeometry } from '../layout/frame-geometry';
import { EditorContext } from './editor-context';

// Moving the round badge (options.features.badgeMove): dragged on the preview or moved with the arrow keys. The
// position is saved in the customized circle, or per stencil; an untouched badge stays where the design has it.

/** less than this (fraction of the frame) is not a real move */
const UNCHANGED_POSITION = 0.001;
/** arrow key steps, fraction of the frame */
const KEY_STEP = 0.005;
const KEY_STEP_LARGE = 0.025;
const KEY_MOVES: Readonly<Partial<Record<string, BadgePosition>>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** The badge on a frame of size 1: center and radius. */
export interface BadgeCircle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** radius with the gap around a floating badge, for the selection outline */
  readonly outer: number;
}

export interface BadgeMoverHost {
  /** the frame as designed */
  readonly designed: Signal<FrameConfig>;
  /** the frame with the moved texts in place; the badge is placed on top of it */
  readonly withTexts: Signal<FrameConfig>;
  /** the frame as drawn (read lazily: it is built from this mover) */
  drawn(): FrameConfig;
  readonly stencil: Signal<Stencil | undefined>;
}

interface Drag {
  readonly from: BadgePosition;
  readonly start: BadgePosition;
}

export class BadgeMover {
  /** On the stencils tab the position is saved per stencil, so a stencil must be shown. */
  readonly movable = computed(
    () =>
      this.editor.opts().features.badgeMove &&
      isRoundBadge(this.host.designed()) &&
      (this.editor.tab() !== 'stencils' || !!this.host.stencil()),
  );
  readonly moved = computed(() => this.saved() !== undefined);
  private readonly isSelected = signal(false);
  readonly selected = this.isSelected.asReadonly();
  /** text for screen readers */
  readonly status = computed(() => (this.selected() ? this.editor.labels().badgeSelected : ''));
  /** the dragged position, before it is saved */
  readonly draft = signal<BadgePosition | null>(null);

  /** undefined: the badge is where the design has it */
  private readonly saved = computed<BadgePosition | undefined>(
    () => {
      if (!this.movable()) {
        return undefined;
      }
      if (this.editor.tab() === 'custom') {
        return this.editor.state().custom.badgePosition;
      }
      const saved = this.editor.state().stencilBadge;
      return saved && saved.stencilId === this.host.stencil()?.id
        ? { x: saved.x, y: saved.y }
        : undefined;
    },
    { equal: samePosition },
  );
  private drag: Drag | null = null;

  constructor(
    private readonly editor: EditorContext,
    private readonly host: BadgeMoverHost,
  ) {
    effect(() => {
      if (!this.movable()) {
        untracked(() => this.clear());
      }
    });
  }

  /**
   * The frame with the badge where the user put it, within the app's limits. Without a move the frame is returned
   * as it is; only a resized badge may be moved off the texts (badgeMovement.restrictOnText).
   */
  applyTo(config: FrameConfig): FrameConfig {
    if (!this.movable() || !isRoundBadge(config)) {
      return config;
    }
    const limits = this.editor.opts().badgeMovement;
    const saved = this.saved();
    const resized = (config.badge.scale ?? 1) !== 1;
    if (!saved && !(resized && limits.restrictOnText)) {
      return config;
    }
    const designed = designedBadgePosition(config);
    const at = placeBadge(config, saved ?? designed, limits);
    if (!saved && Math.hypot(at.x - designed.x, at.y - designed.y) < UNCHANGED_POSITION) {
      return config;
    }
    return withBadgeAt(config, at);
  }

  /** The badge as drawn, on a frame of size 1; null when it cannot be moved. */
  circle(): BadgeCircle | null {
    return this.circleIn(this.host.drawn());
  }

  /** The badge of `config` (e.g. with a drag in progress), on a frame of size 1. */
  circleIn(config: FrameConfig): BadgeCircle | null {
    if (!this.movable() || !isRoundBadge(config)) {
      return null;
    }
    const { x, y, r, gapWidth } = bubblePlacement(
      frameGeometry(1, config),
      config.badge,
      solidRingColor(config.ring),
    );
    return { x, y, r, outer: r + gapWidth };
  }

  select(): void {
    this.isSelected.set(true);
    this.editor.claimSelection('badge');
  }

  /** The "Move badge" button: selects or unselects, and puts the focus on the preview. */
  toggleAndFocus(): void {
    if (this.selected()) {
      this.deselect();
    } else {
      this.select();
      this.editor.focusPreview();
    }
  }

  deselect(): void {
    this.isSelected.set(false);
  }

  /** Back to where the design has it: the saved position is deleted. */
  reset(): void {
    const state = this.editor.state();
    if (this.editor.tab() === 'custom') {
      const { badgePosition, ...custom } = state.custom;
      if (badgePosition) {
        this.editor.update({ custom });
      }
      return;
    }
    const { stencilBadge, ...rest } = state;
    if (stencilBadge?.stencilId === this.host.stencil()?.id) {
      this.editor.replaceState(rest);
    }
  }

  /** Drops an unsaved drag and clears the selection; the Konva drag itself is stopped by the preview. */
  clear(): void {
    this.cancelDrag();
    this.deselect();
  }

  /** A press on the badge: it is selected and may be dragged from `pointer` (0 .. 1 of the frame). */
  startDrag(pointer: BadgePosition): void {
    const badge = this.circle();
    if (!badge) {
      return;
    }
    this.select();
    // as stored (four decimals), so a tap that wobbles and comes back changes nothing
    this.drag = { from: pointer, start: stored(badge) };
  }

  /** The pointer moved: the badge follows within the limits; returns where it is shown. */
  dragTo(pointer: BadgePosition): BadgePosition | null {
    const d = this.drag;
    if (!d) {
      return null;
    }
    // the grab point stays under the pointer, so the badge does not jump to it
    const at = this.place(
      { x: d.start.x + pointer.x - d.from.x, y: d.start.y + pointer.y - d.from.y },
      { snap: true },
    );
    this.draft.set(at);
    return at;
  }

  /** Released: saved once, if it moved. */
  endDrag(): void {
    const d = this.drag;
    const at = this.draft();
    this.cancelDrag();
    if (d && at && !samePosition(at, d.start)) {
      this.save(at);
    }
  }

  /** Released without moving (a click): there is nothing to save. */
  releaseWithoutMove(): void {
    if (this.draft() === null) {
      this.cancelDrag();
    }
  }

  cancelDrag(): boolean {
    const running = this.drag !== null;
    this.drag = null;
    this.draft.set(null);
    return running;
  }

  /** Escape ends a drag, otherwise the selection; the arrow keys move a selected badge. */
  keyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape') {
      if (!this.cancelDrag() && !this.selected()) {
        return false;
      }
      this.deselect();
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    const move = KEY_MOVES[event.key];
    const badge = this.circle();
    if (!move || !badge || !this.selected() || this.drag) {
      return false;
    }
    // the keys belong to the selected badge, also at a limit, so the photo does not move
    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const from = stored(badge);
    const at = this.place({ x: from.x + move.x * step, y: from.y + move.y * step }, { from });
    if (!samePosition(at, from)) {
      this.save(at);
    }
    return true;
  }

  private place(wanted: BadgePosition, move: BadgeMove): BadgePosition {
    const config = this.host.withTexts();
    return isRoundBadge(config)
      ? placeBadge(config, wanted, this.editor.opts().badgeMovement, move)
      : wanted;
  }

  private save(at: BadgePosition): void {
    const stencil = this.host.stencil();
    if (this.editor.tab() === 'custom') {
      this.editor.patch({ badgePosition: at });
    } else if (stencil) {
      this.editor.update({ stencilBadge: { stencilId: stencil.id, ...at } });
    }
  }
}

function stored(p: BadgePosition): BadgePosition {
  return { x: round(p.x, 4), y: round(p.y, 4) };
}

function samePosition(a: BadgePosition | undefined, b: BadgePosition | undefined): boolean {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y);
}
