import { DestroyRef, inject, signal } from '@angular/core';

/**
 * A hidden canvas to measure how wide the texts on the ring are. When a web font finishes loading the widths change,
 * so code that measures calls `trackFonts()` inside a computed and is measured again.
 */
export class TextMeasure {
  private readonly loadedFonts = signal(0);
  private context: CanvasRenderingContext2D | null | undefined;

  constructor() {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (fonts) {
      const remeasure = (): void => this.loadedFonts.update((n) => n + 1);
      fonts.addEventListener('loadingdone', remeasure);
      inject(DestroyRef).onDestroy(() => fonts.removeEventListener('loadingdone', remeasure));
    }
  }

  /** null where there is no canvas (e.g. unit tests) */
  ctx(): CanvasRenderingContext2D | null {
    if (this.context === undefined) {
      this.context =
        typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    }
    return this.context;
  }

  trackFonts(): void {
    this.loadedFonts();
  }
}
