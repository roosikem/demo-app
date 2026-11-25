import { signal } from '@angular/core';
import { FaceFrameError } from '../config/face-frame-options';
import { FrameConfig } from '../models/frame.model';
import { loadStencilImage } from '../rendering/stencil-images';

// The images of image stencils, for the preview and the thumbnails. Each image is loaded once; reading imageFor()
// in a computed or effect runs it again when the image has arrived.

export class StencilImageCache {
  private readonly images = signal<ReadonlyMap<string, HTMLImageElement>>(new Map());
  private readonly requested = new Set<string>();

  constructor(private readonly reportError: (error: FaceFrameError) => void) {}

  /** The stencil image of a frame; null while it loads. */
  imageFor(config: FrameConfig): HTMLImageElement | null {
    if (!config.image) {
      return null;
    }
    this.request(config.image);
    return this.images().get(config.image) ?? null;
  }

  /** how many images have arrived; changes when one arrives */
  count(): number {
    return this.images().size;
  }

  request(url: string): void {
    if (this.requested.has(url)) {
      return;
    }
    this.requested.add(url);
    loadStencilImage(url).then(
      (img) => this.images.update((images) => new Map(images).set(url, img)),
      (cause) => {
        this.requested.delete(url);
        this.reportError({ key: 'STENCIL_LOAD_FAILED', cause });
      },
    );
  }
}
