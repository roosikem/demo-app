import { computed, effect, signal, untracked } from '@angular/core';
import { loadStencilImage } from '../rendering/stencil-images';
import { StickerCommand, applyStickerCommand } from '../stickers/sticker-commands';
import { StickerGestures } from '../stickers/sticker-gestures';
import {
  MAX_STICKERS,
  NO_STICKERS,
  NO_STICKER_IMAGES,
  Sticker,
  StickerContent,
  StickerImage,
  createSticker,
  newStickerId,
  sameStickers,
} from '../stickers/sticker.model';
import { EditorContext } from './editor-context';
import { ServerSources } from './server-sources';

// Stickers on the photo (options.features.stickers): adding and removing them, which one is selected, dragging
// them, and loading the images of image stickers.

export class StickerLayer {
  readonly max = MAX_STICKERS;

  /** The stickers of the design. An image sticker whose image is no longer in stencils.json is left out. */
  readonly list = computed(
    () => {
      const saved = this.enabled() ? this.editor.state().stickers : undefined;
      if (!saved?.length) {
        return NO_STICKERS;
      }
      const status = this.sources.manifestStatus();
      if (status === 'pending' || status === 'failed') {
        return saved;
      }
      const offered = this.sources.stickerImages();
      return saved.filter((s) => s.image === undefined || offered.some((i) => i.id === s.image));
    },
    { equal: sameStickers },
  );
  /** image stickers offered next to the emojis */
  readonly images = computed(() =>
    this.enabled() ? this.sources.stickerImages() : NO_STICKER_IMAGES,
  );
  readonly loadedImages = signal<ReadonlyMap<string, HTMLImageElement>>(new Map());
  /** the image stickers used in the design */
  readonly imagesInUse = computed(
    () => this.images().filter((image) => this.list().some((s) => s.image === image.id)),
    { equal: (a, b) => a.length === b.length && a.every((image, i) => image === b[i]) },
  );
  readonly selected = computed(() => this.list().find((s) => s.id === this.selectedId()) ?? null);
  /** the dragged sticker, before it is saved */
  readonly draft = signal<Sticker | null>(null);
  /** text for screen readers: what just happened, or which sticker is selected */
  readonly status = computed(() => {
    const announcement = this.announcement();
    const selected = this.selected();
    if (announcement || !selected) {
      return announcement;
    }
    const number = String(this.list().indexOf(selected) + 1);
    return this.editor.labels().stickerSelected.replace('{n}', number);
  });
  readonly gestures = new StickerGestures({
    stickers: () => this.list(),
    selectedId: () => this.selected()?.id ?? null,
    select: (id) => this.select(id),
    preview: (draft) => this.draft.set(draft),
    commit: (command) => this.apply(command),
  });

  private readonly enabled = computed(() => this.editor.opts().features.stickers);
  private readonly selectedId = signal<string | null>(null);
  private readonly announcement = signal('');
  private readonly requestedImages = new Set<string>();

  constructor(
    private readonly editor: EditorContext,
    private readonly sources: ServerSources,
  ) {
    // switched off, also in the middle of a drag
    effect(() => {
      if (!this.enabled()) {
        untracked(() => this.clear());
      }
    });

    effect(() => {
      for (const image of this.imagesInUse()) {
        if (!this.requestedImages.has(image.id)) {
          this.requestedImages.add(image.id);
          this.loadImage(image);
        }
      }
    });
  }

  add(content: StickerContent): void {
    const stickers = this.list();
    if (stickers.length >= MAX_STICKERS) {
      this.announcement.set(this.limitText());
      return;
    }
    const sticker = createSticker(newStickerId(stickers), content, stickers);
    this.apply({ type: 'add', sticker });
    this.select(sticker.id);
    if (this.list().length >= MAX_STICKERS) {
      this.announcement.set(this.limitText());
    }
  }

  select(id: string | null): void {
    this.selectedId.set(id);
    this.announcement.set('');
    if (id) {
      this.editor.claimSelection('sticker');
    }
  }

  /** From the sticker list: select, then the arrow keys move the sticker on the preview. */
  selectAndFocus(id: string): void {
    this.select(id);
    this.editor.focusPreview();
  }

  deselect(): void {
    this.select(null);
  }

  remove(id: string): void {
    const index = this.list().findIndex((s) => s.id === id);
    this.apply({ type: 'remove', id });
    if (this.selectedId() === id) {
      this.deselect();
    }
    this.announcement.set(this.editor.labels().stickerRemoved);
    // the focused remove button is gone: move the focus to the next sticker, or to the add buttons
    const remaining = this.list().length;
    this.editor.focusLater(remaining ? `sticker-${Math.min(index, remaining - 1)}` : 'sticker-add');
  }

  /** e.g. "Sticker 2 ⭐" or "Sticker 3 Heart" */
  itemLabel(index: number, sticker: Sticker): string {
    const name = this.editor.labels().stickerItem.replace('{n}', String(index + 1));
    const label = this.image(sticker.image)?.label;
    const content =
      sticker.emoji ?? (label === undefined ? undefined : this.editor.opts().translate(label));
    return content ? `${name} ${content}` : name;
  }

  image(id: string | undefined): StickerImage | undefined {
    return id === undefined ? undefined : this.images().find((i) => i.id === id);
  }

  limitText(): string {
    return this.editor.labels().stickerLimit.replace('{max}', String(MAX_STICKERS));
  }

  /** Stops a running drag and clears the selection. */
  clear(): void {
    this.gestures.cancel();
    this.selectedId.set(null);
    this.announcement.set('');
    this.draft.set(null);
  }

  /** Loads the images an export needs; works also before stencils.json has loaded. */
  async imagesForExport(): Promise<ReadonlyMap<string, HTMLImageElement>> {
    const stickers = this.list();
    if (!stickers.some((s) => s.image !== undefined)) {
      return new Map();
    }
    const offered = await this.sources.stickerImagesWhenLoaded();
    const loaded = await Promise.all(
      offered
        .filter((image) => stickers.some((s) => s.image === image.id))
        .map((image) =>
          loadStencilImage(image.url).then(
            (img): [string, HTMLImageElement] => [image.id, img],
            () => null,
          ),
        ),
    );
    return new Map(loaded.filter((entry): entry is [string, HTMLImageElement] => entry !== null));
  }

  private loadImage(image: StickerImage): void {
    loadStencilImage(image.url).then(
      (img) => this.loadedImages.update((loaded) => new Map(loaded).set(image.id, img)),
      (cause) => {
        // not drawn; tried again with the next change of the stickers
        this.requestedImages.delete(image.id);
        this.editor.reportError({ key: 'STENCIL_LOAD_FAILED', cause });
      },
    );
  }

  private apply(command: StickerCommand): void {
    // the list is empty while the feature is off: saving it would delete the user's stickers
    if (!this.enabled()) {
      return;
    }
    const before = this.list();
    const after = applyStickerCommand(before, command);
    if (!sameStickers(before, after)) {
      this.editor.update({ stickers: after });
    }
  }
}
