import { computed, effect, signal, untracked } from '@angular/core';
import { FrameConfig } from '../models/frame.model';
import { Point } from '../models/pointer';
import { AngleRange } from '../rendering/ring-gaps';
import { freeTextRange, keepTextsApart, textAt } from '../rendering/text-position';
import { EditorContext } from './editor-context';
import { TextGestures } from './text-gestures';
import { TextMeasure } from './text-measure';

// Moving the top and bottom text of the customized circle along the ring (options.features.textMove), by drag or
// arrow keys. A text never goes onto the other one. Texts are numbered as in the frame: 0 = top, 1 = bottom.

export class TextMover {
  private readonly selectedIndex = signal<number | null>(null);

  readonly movable = computed(
    () => this.editor.opts().features.textMove && this.editor.tab() === 'custom',
  );
  readonly moved = computed(() => {
    const { topTextAngle, bottomTextAngle } = this.editor.state().custom;
    return this.movable() && (topTextAngle !== undefined || bottomTextAngle !== undefined);
  });
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
  readonly draft = signal<{ readonly index: number; readonly center: number } | null>(null);
  readonly gestures = new TextGestures({
    textAt: (p) => this.textAt(p),
    text: (index) => this.text(index),
    selected: () => this.selected(),
    select: (index) => (index === null ? this.deselect() : this.select(index)),
    preview: (draft) => this.draft.set(draft),
    commit: (index, center) =>
      this.editor.patch(index === 0 ? { topTextAngle: center } : { bottomTextAngle: center }),
  });

  constructor(
    private readonly editor: EditorContext,
    private readonly measure: TextMeasure,
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
    const ctx = this.measure.ctx();
    if (!moved.length || !ctx) {
      return config;
    }
    this.measure.trackFonts();
    return keepTextsApart(ctx, config, moved);
  }

  /** Selects a text: the left and right arrow keys then move it. */
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

  /** Stops a running drag and clears the selection. */
  clear(): void {
    this.gestures.cancel();
    this.deselect();
  }

  private textAt(p: Point): number | null {
    const ctx = this.measure.ctx();
    return this.movable() && ctx ? textAt(ctx, this.frame(), p) : null;
  }

  /** null for an empty text, or when the other text leaves no room */
  private text(index: number): { center: number; range: AngleRange } | null {
    const ctx = this.measure.ctx();
    const config = this.frame();
    const text = config.texts[index];
    if (!this.movable() || !ctx || !text?.text.trim()) {
      return null;
    }
    const range = freeTextRange(ctx, config, index);
    return range && { center: text.center, range };
  }
}
