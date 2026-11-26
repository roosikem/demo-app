import { computed, effect, signal, untracked } from '@angular/core';
import { FrameConfig } from '../models/frame.model';
import { clamp, signedDegrees } from '../models/numbers';
import { Point, angleFromTop } from '../models/pointer';
import {
  AngleRange,
  angleInRange,
  constrainAngle,
  readableDirection,
  storedAngle,
} from '../layout/ring-gaps';
import { freeTextRange, halfSpans, keepTextsApart } from '../layout/text-placement';
import { EditorContext } from './editor-context';

// Moving the top and bottom text of the customized circle along the ring (options.features.textMove): dragged on
// the preview or moved with the arrow keys. A text never goes onto the other one. Texts are numbered as in the
// frame: 0 = top, 1 = bottom.

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

export interface TextDraft {
  readonly index: number;
  readonly center: number;
}

interface Drag {
  readonly index: number;
  readonly start: number;
  /** null on a free ring: the text goes round without an end */
  readonly range: AngleRange | null;
  /** pointer angle at the last move */
  pointer: number;
  /**
   * Center the pointer asks for, in the range's numbers and not limited to it: it follows every turn of the
   * pointer, so the text stays at the end it reached until the pointer comes back, and never jumps across.
   */
  wanted: number;
}

export class TextMover {
  readonly movable = computed(
    () => this.editor.opts().features.textMove && this.editor.tab() === 'custom',
  );
  readonly moved = computed(() => {
    const { topTextAngle, bottomTextAngle } = this.editor.state().custom;
    return this.movable() && (topTextAngle !== undefined || bottomTextAngle !== undefined);
  });
  private readonly selectedIndex = signal<number | null>(null);
  readonly selected = this.selectedIndex.asReadonly();
  /** text for screen readers, e.g. "Text at bottom selected. …" */
  readonly status = computed(() => {
    const index = this.selected();
    if (index === null) {
      return '';
    }
    const labels = this.editor.labels();
    return labels.textSelected.replace('{text}', index === 0 ? labels.topText : labels.bottomText);
  });
  /** the dragged text, before it is saved */
  readonly draft = signal<TextDraft | null>(null);
  private drag: Drag | null = null;

  constructor(
    private readonly editor: EditorContext,
    /** the frame with the texts where they are drawn (read lazily: it is built from this mover) */
    private readonly frame: () => FrameConfig,
  ) {
    effect(() => {
      if (!this.movable()) {
        untracked(() => this.clear());
      }
    });
  }

  /** The frame with the moved texts in place, kept apart from each other. */
  applyTo(config: FrameConfig): FrameConfig {
    if (!this.movable()) {
      return config;
    }
    const { topTextAngle, bottomTextAngle } = this.editor.state().custom;
    const moved = [topTextAngle, bottomTextAngle]
      .map((angle, index) => (angle === undefined ? -1 : index))
      .filter((index) => index >= 0);
    return moved.length ? keepTextsApart(config, moved) : config;
  }

  /** Center and half the angle of each movable text of `config` (e.g. with a drag in progress); null if empty. */
  arcsIn(config: FrameConfig): ({ readonly center: number; readonly half: number } | null)[] {
    if (!this.movable()) {
      return [];
    }
    const halves = halfSpans(config);
    return config.texts.map((t, i) =>
      halves[i] > 0 ? { center: t.center, half: halves[i] } : null,
    );
  }

  select(index: number): void {
    this.selectedIndex.set(index);
    this.editor.claimSelection('text');
  }

  /** The "Move top text" / "Move bottom text" buttons: select or unselect, and focus the preview. */
  toggleAndFocus(index: number): void {
    if (this.selected() === index) {
      this.deselect();
    } else {
      this.select(index);
      this.editor.focusPreview();
    }
  }

  deselect(): void {
    this.selectedIndex.set(null);
  }

  /** Both texts back where the layout has them. */
  reset(): void {
    const { topTextAngle, bottomTextAngle, ...custom } = this.editor.state().custom;
    if (topTextAngle !== undefined || bottomTextAngle !== undefined) {
      this.editor.update({ custom });
    }
  }

  /** Drops an unsaved drag and clears the selection; the Konva drag itself is stopped by the preview. */
  clear(): void {
    this.cancelDrag();
    this.deselect();
  }

  /** A press on text `index` at `pointer` (0 .. 1 of the frame): it is selected and may be dragged. */
  startDrag(index: number, pointer: Point): void {
    const text = this.text(index);
    if (!text) {
      return;
    }
    this.select(index);
    this.drag = {
      index,
      start: text.center,
      range: limited(text.range),
      pointer: pointerAngle(pointer),
      wanted: angleInRange(text.range, text.center),
    };
  }

  dragTo(pointer: Point): void {
    const d = this.drag;
    if (!d) {
      return;
    }
    const angle = pointerAngle(pointer);
    d.wanted += signedDegrees(angle - d.pointer);
    d.pointer = angle;
    const center = storedAngle(
      d.range,
      d.range ? clamp(d.wanted, d.range.min, d.range.max) : d.wanted,
    );
    this.draft.set({ index: d.index, center });
  }

  /** Released: saved once, if it moved (a click only selects). */
  endDrag(): void {
    const d = this.drag;
    const draft = this.draft();
    this.cancelDrag();
    if (d && draft && draft.center !== d.start) {
      this.save(d.index, draft.center);
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

  /** Escape ends a drag, otherwise the selection; left / right move a selected text along the ring. */
  keyDown(event: KeyboardEvent): boolean {
    const selected = this.selected();
    if (event.key === 'Escape') {
      if (!this.cancelDrag() && selected === null) {
        return false;
      }
      this.deselect();
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    const direction = KEY_TURNS[event.key];
    const text = selected === null ? null : this.text(selected);
    if (direction === undefined || selected === null || !text || this.drag) {
      return false;
    }
    // all arrow keys belong to the selected text (up / down do nothing), so the photo does not move
    event.preventDefault();
    const visual = readableDirection(text.center) === 'ccw' ? -direction : direction;
    const wanted = text.center + visual * (event.shiftKey ? KEY_STEP_LARGE : KEY_STEP);
    const range = limited(text.range);
    const center = storedAngle(range, range ? constrainAngle(range, wanted) : wanted);
    if (center !== text.center) {
      this.save(selected, center);
    }
    return true;
  }

  private save(index: number, center: number): void {
    this.editor.patch(index === 0 ? { topTextAngle: center } : { bottomTextAngle: center });
  }

  /** null for an empty text, or when the other text leaves no room */
  private text(index: number): { center: number; range: AngleRange } | null {
    const config = this.frame();
    const text = config.texts[index];
    if (!this.movable() || !text?.text.trim()) {
      return null;
    }
    const range = freeTextRange(config, index);
    return range && { center: text.center, range };
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
