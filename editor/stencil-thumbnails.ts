import { Signal, effect, signal, untracked } from '@angular/core';
import { FrameConfig, PhotoTransform, Stencil } from '../models/frame.model';
import { EditorContext } from './editor-context';
import { StencilImageCache } from './stencil-image-cache';

// The small pictures in the premade stencil gallery: each stencil drawn with the user's photo. Only the stencils
// that are shown get one; they are kept until the photo, its position or the stencil list changes.

const THUMB_SIZE = 72;
/** thumbnails drawn per animation frame, so a long list does not block the page */
const THUMB_BATCH = 8;

export interface StencilThumbnailsHost {
  readonly image: Signal<HTMLImageElement | null>;
  readonly photo: Signal<PhotoTransform>;
  readonly visible: Signal<readonly Stencil[]>;
  /** true while the photo is dragged: no thumbnails meanwhile */
  readonly paused: Signal<boolean>;
  /** the stencil as it is drawn (texts translated or not) */
  config(stencil: Stencil): FrameConfig;
  render(
    config: FrameConfig,
    image: HTMLImageElement | null,
    photo: PhotoTransform,
    size: number,
    overlay: HTMLImageElement | null,
  ): string;
}

export class StencilThumbnails {
  readonly size = THUMB_SIZE;
  /** image URL per stencil id */
  readonly urls = signal<Record<string, string>>({});
  private readonly cache = new Map<string, string>();
  private cacheKey = '';
  private cachedFor: readonly Stencil[] | null = null;

  constructor(
    editor: EditorContext,
    private readonly images: StencilImageCache,
    private readonly host: StencilThumbnailsHost,
  ) {
    effect(() => {
      if (editor.tab() !== 'stencils' || host.paused()) {
        return;
      }
      const image = host.image();
      const photo = host.photo();
      const stencils = editor.opts().stencils;
      const visible = host.visible();
      visible.forEach((s) => s.config.image && images.request(s.config.image));
      const key = [
        image?.src ?? '',
        photo.zoom,
        photo.rotation,
        photo.offsetX,
        photo.offsetY,
        images.count(),
      ].join('|');
      if (key !== this.cacheKey || stencils !== this.cachedFor) {
        this.cacheKey = key;
        this.cachedFor = stencils;
        this.cache.clear();
      }
      this.render(
        visible.filter((s) => !this.cache.has(s.id)),
        { key, image, photo },
      );
    });
  }

  /** Draws in batches, each with the photo the key was made from; stops when the key changes. */
  private render(
    list: readonly Stencil[],
    drawn: { key: string; image: HTMLImageElement | null; photo: PhotoTransform },
  ): void {
    const { key, image, photo } = drawn;
    let index = 0;
    const step = (): void => {
      if (key !== this.cacheKey) {
        return;
      }
      for (const s of list.slice(index, index + THUMB_BATCH)) {
        const config = this.host.config(s);
        this.cache.set(
          s.id,
          this.host.render(config, image, photo, THUMB_SIZE * 2, this.images.imageFor(config)),
        );
      }
      index += THUMB_BATCH;
      this.urls.set(this.record());
      if (index < list.length) {
        requestAnimationFrame(step);
      }
    };
    if (list.length) {
      step();
    } else if (Object.keys(untracked(this.urls)).length !== this.cache.size) {
      this.urls.set(this.record());
    }
  }

  private record(): Record<string, string> {
    // no prototype: the stencil ids are the keys
    const result = Object.create(null) as Record<string, string>;
    this.cache.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
