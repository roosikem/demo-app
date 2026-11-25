import { Signal, computed, effect, signal, untracked } from '@angular/core';
import { BadgePosition, FrameConfig, Stencil } from '../models/frame.model';
import {
  BadgeMove,
  designedBadgePosition,
  isRoundBadge,
  placeBadge,
} from '../rendering/badge-position';
import { bubblePlacement, geometry, solidRingColor } from '../rendering/frame-renderer';
import { BadgeCircle, BadgeGestures } from './badge-gestures';
import { EditorContext } from './editor-context';
import { TextMeasure } from './text-measure';

// Moving the round badge (options.features.badgeMove) by drag or arrow keys. The position is saved in the custom
// frame, or per stencil; an untouched badge stays exactly where the frame design has it.

/** less than this (fraction of the frame) is not a real move */
const UNCHANGED_POSITION = 0.001;

export interface BadgeMoverHost {
  /** the frame as designed */
  readonly designed: Signal<FrameConfig>;
  /** the frame with the moved texts in place; the badge is placed on top of it */
  readonly withTexts: Signal<FrameConfig>;
  /** the frame as drawn (read lazily: it is built from this mover) */
  drawn(): FrameConfig;
  readonly stencil: Signal<Stencil | undefined>;
}

export class BadgeMover {
  /** On the stencils tab the position is saved per stencil, so a stencil must be shown. */
  readonly movable = computed(
    () =>
      this.editor.opts().features.badgeMove &&
      isRoundBadge(this.host.designed()) &&
      (this.editor.tab() !== 'stencils' || !!this.host.stencil()),
  );
  private readonly isSelected = signal(false);
  readonly moved = computed(() => this.saved() !== undefined);
  readonly selected = this.isSelected.asReadonly();
  /** text for screen readers */
  readonly status = computed(() => (this.selected() ? this.editor.labels().badgeSelected : ''));
  /** the dragged position, before it is saved */
  readonly draft = signal<BadgePosition | null>(null);
  readonly gestures = new BadgeGestures({
    badge: () => this.circle(),
    place: (wanted, move) => this.place(wanted, move),
    selected: () => this.selected(),
    select: (selected) => (selected ? this.select() : this.deselect()),
    preview: (at) => this.draft.set(at),
    commit: (at) => this.save(at),
  });

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

  constructor(
    private readonly editor: EditorContext,
    private readonly measure: TextMeasure,
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
    if (limits.restrictOnText) {
      this.measure.trackFonts();
    }
    const designed = designedBadgePosition(config);
    const at = placeBadge(this.measure.ctx(), config, saved ?? designed, limits);
    if (!saved && Math.hypot(at.x - designed.x, at.y - designed.y) < UNCHANGED_POSITION) {
      return config;
    }
    return withBadgeAt(config, at);
  }

  /** Selects the badge: the arrow keys then move it. */
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

  /** Stops a running drag and clears the selection. */
  clear(): void {
    this.gestures.cancel();
    this.deselect();
  }

  /** The badge on a frame of size 1, to find out if a press hits it. */
  circle(): BadgeCircle | null {
    const config = this.host.drawn();
    if (!this.movable() || !isRoundBadge(config)) {
      return null;
    }
    const { x, y, r } = bubblePlacement(
      geometry(1, config),
      config.badge,
      solidRingColor(config.ring),
    );
    return { x, y, r };
  }

  private place(wanted: BadgePosition, move: BadgeMove): BadgePosition {
    const config = this.host.withTexts();
    return isRoundBadge(config)
      ? placeBadge(this.measure.ctx(), config, wanted, this.editor.opts().badgeMovement, move)
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

export function withBadgeAt(config: FrameConfig, at: BadgePosition): FrameConfig {
  return config.badge?.shape === 'bubble' ? { ...config, badge: { ...config.badge, at } } : config;
}

function samePosition(a: BadgePosition | undefined, b: BadgePosition | undefined): boolean {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y);
}
