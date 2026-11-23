import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  CustomFrameState,
  RING_WIDTH,
  buildCustomFrame,
  ringBackground,
} from '../rendering/custom-frame';
import {
  DEFAULT_FACE_FRAME_OPTIONS,
  FACE_FRAME_OPTIONS,
  FaceFrameError,
  FaceFrameOptions,
  FaceFrameOptionsInput,
  mergeFaceFrameOptions,
} from '../config/face-frame-options';
import {
  FaceFrameState,
  initialFaceFrameState,
  sanitizeFaceFrameState,
  sanitizePhoto,
} from '../config/face-frame-state';
import { DEFAULT_LABELS, FrameLabels } from '../config/frame-labels';
import { contrastRatio, geometry, renderFrame, renderToBlob } from '../rendering/frame-renderer';
import { loadStencilImage } from '../rendering/stencil-images';
import {
  BadgeIcon,
  ExportFormat,
  FrameConfig,
  PhotoTransform,
  Stencil,
} from '../models/frame.model';
import { Palette } from '../stencils/stencils';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { FfIconComponent } from '../icon/ff-icon.component';

type Tab = FaceFrameState['tab'];

const THUMB_SIZE = 72;
const THUMB_BATCH = 8;
const SEARCH_MAX_LENGTH = 64;
const ZOOM_STEP_BUTTON = 1.1;
const ZOOM_STEP_WHEEL = 1.06;
const ZOOM_STEP_KEY = 1.05;

let nextId = 0;

/** Profile photo frame editor. */
@Component({
  selector: 'app-face-frame-editor',
  imports: [ColorPickerComponent, FfIconComponent],
  templateUrl: './face-frame-editor.component.html',
  styleUrls: [
    './face-frame-editor.component.scss',
    './face-frame-controls.scss',
    './face-frame-gallery.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'onResize()' },
})
export class FaceFrameEditorComponent implements OnDestroy {
  readonly source = input<Blob | string | null>(null);
  readonly options = input<FaceFrameOptionsInput | null>(null);
  readonly state = model<FaceFrameState | null>(null);
  readonly shownInPhoto = input(false);

  readonly changed = output<{ config: FrameConfig; photo: PhotoTransform }>();
  readonly showInPhoto = output<Blob>();
  readonly framedChange = output<Blob>();
  readonly resetPhotoView = output<void>();
  readonly ready = output<boolean>();
  readonly downloaded = output<{ blob: Blob; fileName: string }>();
  readonly frameError = output<FaceFrameError>();

  private readonly appOptions = inject(FACE_FRAME_OPTIONS, { optional: true });
  protected readonly opts = computed<FaceFrameOptions>(() =>
    mergeFaceFrameOptions(DEFAULT_FACE_FRAME_OPTIONS, this.appOptions, this.options()),
  );
  protected readonly t = computed<FrameLabels>(() => ({
    ...DEFAULT_LABELS,
    ...this.opts().labels,
  }));
  protected readonly features = computed(() => this.opts().features);
  protected readonly colorNames = computed(() => {
    const { colorNames, translate } = this.opts();
    const translated: Record<string, string> = {};
    for (const hex of Object.keys(colorNames)) {
      translated[hex] = translate(colorNames[hex]);
    }
    return translated;
  });
  protected readonly bothTabs = computed(
    () => this.features().customTab && this.features().stencilsTab,
  );

  protected readonly uid = `ff${nextId++}`;
  protected readonly thumbSize = THUMB_SIZE;
  protected readonly searchMaxLength = SEARCH_MAX_LENGTH;
  protected readonly ringWidth = RING_WIDTH;
  protected readonly ringStyles: readonly CustomFrameState['ringStyle'][] = [
    'solid',
    'gradient',
    'segments',
  ];
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // parent's [(state)] if set, otherwise the defaults
  private readonly current = linkedSignal<FaceFrameState>(() =>
    sanitizeFaceFrameState(this.state(), this.opts()),
  );
  protected readonly tab = computed<Tab>(() => {
    const { customTab, stencilsTab } = this.features();
    if (!stencilsTab) {
      return 'custom';
    }
    if (!customTab) {
      return 'stencils';
    }
    return this.current().tab;
  });
  protected readonly custom = computed(() => this.current().custom);
  protected readonly stencilId = computed(() => this.current().stencilId);
  protected readonly photo = computed(() => this.current().photo);
  protected readonly format = computed(() => this.current().downloadFormat);

  protected readonly windowWidth = signal(typeof window === 'undefined' ? 1920 : window.innerWidth);
  protected readonly tooSmall = computed(() => this.windowWidth() < this.opts().minWindowWidth);

  private readonly image = signal<HTMLImageElement | null>(null);
  readonly hasImage = computed(() => this.image() !== null);
  protected readonly loadError = signal(false);

  readonly config = computed<FrameConfig>(() => {
    const o = this.opts();
    if (this.tab() === 'stencils') {
      const stencil = o.stencils.find((s) => s.id === this.stencilId()) ?? o.stencils[0];
      if (stencil) {
        return this.stencilConfig(stencil);
      }
    }
    return buildCustomFrame(this.custom(), o.palettes, {
      text: o.textMaxLength,
      badgeLine: o.badgeLineMaxLength,
    });
  });

  protected readonly topContrastLow = computed(() => this.contrastLow(this.custom().topColor));
  protected readonly bottomContrastLow = computed(() =>
    this.contrastLow(this.custom().bottomColor),
  );

  protected readonly query = signal('');
  protected readonly category = signal<string | null>(null);
  protected readonly categories = computed(() => {
    const seen: string[] = [];
    for (const s of this.opts().stencils) {
      if (s.category && !seen.includes(s.category)) {
        seen.push(s.category);
      }
    }
    return seen;
  });
  protected readonly visibleStencils = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    const translate = this.opts().translate;
    return this.opts().stencils.filter(
      (s) => (!cat || s.category === cat) && (!q || searchText(s, translate).includes(q)),
    );
  });
  // uncategorised stencils go last, without an optgroup
  protected readonly stencilGroups = computed(() => {
    const groups = this.categories().map((c) => ({
      category: c,
      stencils: this.opts().stencils.filter((s) => s.category === c),
    }));
    const rest = this.opts().stencils.filter((s) => !s.category);
    return rest.length ? [...groups, { category: '', stencils: rest }] : groups;
  });
  protected readonly selectedStencil = computed(() =>
    this.opts().stencils.find((s) => s.id === this.stencilId()),
  );
  protected readonly selectedHidden = computed(
    () =>
      !!this.selectedStencil() && !this.visibleStencils().some((s) => s.id === this.stencilId()),
  );
  // roving tabindex: only one card is in the tab order
  protected readonly focusableStencilId = computed(() =>
    this.selectedHidden() ? this.visibleStencils()[0]?.id : this.stencilId(),
  );
  protected readonly resultText = computed(() => {
    const count = this.t()
      .resultCount.replace('{n}', String(this.visibleStencils().length))
      .replace('{total}', String(this.opts().stencils.length));
    const category = this.category();
    return category ? `${count} · ${this.tr(category)}` : count;
  });
  protected readonly noMatchText = computed(() =>
    this.t().noMatch.replace('{q}', this.query().trim()),
  );

  protected readonly thumbnails = signal<Record<string, string>>({});
  private readonly thumbCache = new Map<string, string>();
  private thumbKey = '';
  private readonly stencilImages = signal<ReadonlyMap<string, HTMLImageElement>>(new Map());
  private readonly requestedImages = new Set<string>();
  private thumbStencils: readonly Stencil[] | null = null;
  protected readonly smallPreview = signal('');

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('preview');
  private objectUrl: string | null = null;
  private drag: { pointerId: number; x: number; y: number; start: PhotoTransform } | null = null;
  private readonly dragging = signal(false);
  private exporting = false;
  private exportAgain = false;

  constructor() {
    effect((onCleanup) => {
      const source = this.source();
      let cancelled = false;
      onCleanup(() => (cancelled = true));
      this.load(source).then(
        (img) => {
          if (!cancelled) {
            this.image.set(img);
            this.loadError.set(false);
            this.ready.emit(img !== null);
          }
        },
        (cause) => {
          if (!cancelled) {
            this.image.set(null);
            this.loadError.set(true);
            this.ready.emit(false);
            this.frameError.emit({ key: 'LOAD_FAILED', cause });
          }
        },
      );
    });

    effect(() => {
      const canvas = this.canvas()?.nativeElement;
      const config = this.config();
      const photo = this.photo();
      const image = this.image();
      const cssSize = this.opts().previewSize;
      if (!canvas) {
        return;
      }
      const size = Math.round(cssSize * Math.min(3, window.devicePixelRatio || 1));
      if (canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      const overlay = this.stencilImageFor(config);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        renderFrame(ctx, size, config, image, photo, undefined, overlay);
      }
      if (untracked(this.features).chatPreview) {
        this.smallPreview.set(this.renderDataUrl(config, image, photo, 96, overlay));
      }
      this.changed.emit({ config, photo });
      if (image && untracked(this.shownInPhoto)) {
        this.queueFramedChange();
      }
    });

    // thumbnails: visible stencils only, cached per photo position, not while dragging
    effect(() => {
      if (this.tab() !== 'stencils' || this.dragging()) {
        return;
      }
      const image = this.image();
      const photo = this.photo();
      const stencils = this.opts().stencils;
      const visible = this.visibleStencils();
      visible.forEach((s) => s.config.image && this.requestStencilImage(s.config.image));
      const loadedImages = this.stencilImages().size;
      const key = `${image?.src ?? ''}|${photo.zoom}|${photo.rotation}|${photo.offsetX}|${photo.offsetY}|${loadedImages}`;
      if (key !== this.thumbKey || stencils !== this.thumbStencils) {
        this.thumbKey = key;
        this.thumbStencils = stencils;
        this.thumbCache.clear();
      }
      this.renderThumbnails(
        visible.filter((s) => !this.thumbCache.has(s.id)),
        image,
        photo,
        key,
      );
    });
  }

  ngOnDestroy(): void {
    this.revokeObjectUrl();
  }

  async exportImage(size?: number, format?: ExportFormat): Promise<Blob> {
    const image = this.image();
    if (!image) {
      throw new Error('No photo loaded');
    }
    const o = this.opts();
    const config = this.config();
    const photo = this.photo();
    const overlay = config.image ? await loadStencilImage(config.image) : null;
    return renderToBlob(
      config,
      image,
      photo,
      size ?? o.export.size,
      format ?? o.export.format,
      overlay,
    );
  }

  reset(): void {
    this.update(initialFaceFrameState(this.opts()));
  }

  protected onResize(): void {
    this.windowWidth.set(window.innerWidth);
  }

  protected patch(change: Partial<CustomFrameState>): void {
    this.update({ custom: { ...this.custom(), ...change } });
  }

  protected setPhoto(change: Partial<PhotoTransform>): void {
    this.update({ photo: sanitizePhoto({ ...this.photo(), ...change }, this.opts()) });
  }

  protected zoomBy(direction: 1 | -1): void {
    this.setPhoto({ zoom: this.photo().zoom * ZOOM_STEP_BUTTON ** direction });
  }

  protected rotateBy(degrees: number): void {
    this.setPhoto({ rotation: this.photo().rotation + degrees });
  }

  protected resetPhoto(): void {
    this.update({ photo: initialFaceFrameState(this.opts()).photo });
  }

  protected resetCustom(): void {
    this.update({ custom: this.opts().defaultCustom });
  }

  protected selectTab(tab: Tab): void {
    this.update({ tab });
    if (tab === 'stencils') {
      this.scrollToStencil(this.stencilId(), false);
    }
  }

  protected selectStencil(id: string): void {
    this.update({ stencilId: id });
  }

  protected setFormat(format: ExportFormat): void {
    this.update({ downloadFormat: format });
  }

  protected setCategory(category: string | null): void {
    this.category.set(category);
  }

  protected setQuery(event: Event): void {
    this.query.set(this.text(event).slice(0, SEARCH_MAX_LENGTH));
  }

  protected clearFilters(): void {
    this.query.set('');
    this.category.set(null);
  }

  protected jumpTo(id: string): void {
    this.selectStencil(id);
    if (this.selectedHidden()) {
      this.clearFilters();
    }
    this.scrollToStencil(id, false);
  }

  protected showSelectedStencil(): void {
    this.clearFilters();
    this.scrollToStencil(this.stencilId(), true);
  }

  protected onGalleryKey(event: KeyboardEvent): void {
    const list = this.visibleStencils();
    if (!list.length) {
      return;
    }
    const gallery = event.currentTarget as HTMLElement;
    const card = gallery.querySelector<HTMLElement>('.ff-stencil');
    const columns = card
      ? Math.max(1, Math.round(gallery.clientWidth / (card.offsetWidth + 12)))
      : 1;
    const current = Math.max(
      0,
      list.findIndex((s) => s.id === this.focusableStencilId()),
    );
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      ArrowDown: current + columns,
      ArrowUp: current - columns,
      Home: 0,
      End: list.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    const target = list[Math.min(list.length - 1, Math.max(0, next))];
    this.selectStencil(target.id);
    this.scrollToStencil(target.id, true);
  }

  protected onTabKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next: Tab = this.tab() === 'custom' ? 'stencils' : 'custom';
      this.selectTab(next);
      this.findById(`tab-${next}`)?.focus();
    }
  }

  protected async onShowInPhoto(): Promise<void> {
    try {
      this.showInPhoto.emit(await this.exportImage());
    } catch (cause) {
      this.frameError.emit({ key: 'EXPORT_FAILED', cause });
    }
  }

  protected async download(): Promise<void> {
    const { size, fileName } = this.opts().download;
    const format = this.format();
    try {
      const blob = await this.exportImage(size, format);
      const name = `${fileName}.${format === 'image/jpeg' ? 'jpg' : 'png'}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.downloaded.emit({ blob, fileName: name });
    } catch (cause) {
      this.frameError.emit({ key: 'DOWNLOAD_FAILED', cause });
    }
  }

  protected tr(text: string): string {
    return this.opts().translate(text);
  }

  protected iconLabel(icon: BadgeIcon): string {
    const t = this.t();
    return {
      none: t.iconNone,
      check: t.iconCheck,
      star: t.iconStar,
      heart: t.iconHeart,
      cloud: t.iconCloud,
    }[icon];
  }

  protected ringStyleLabel(style: CustomFrameState['ringStyle']): string {
    const t = this.t();
    return { solid: t.styleSolid, gradient: t.styleGradient, segments: t.styleSegments }[style];
  }

  protected paletteGradient(palette: Palette): string {
    return `linear-gradient(90deg, ${palette.colors.join(', ')})`;
  }

  protected formatLabel(format: ExportFormat): string {
    return format === 'image/jpeg' ? 'JPG' : 'PNG';
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected number(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.hasImage() || !event.isPrimary || event.button !== 0) {
      return;
    }
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging.set(true);
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: this.photo(),
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      return;
    }
    // offsets are relative to the photo circle diameter
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const size = this.opts().previewSize;
    const diameter = ((geometry(size, this.config()).photo * 2) / size) * rect.width;
    this.setPhoto({
      offsetX: this.drag.start.offsetX + (event.clientX - this.drag.x) / diameter,
      offsetY: this.drag.start.offsetY + (event.clientY - this.drag.y) / diameter,
    });
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.drag?.pointerId === event.pointerId) {
      this.drag = null;
      this.dragging.set(false);
    }
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.hasImage()) {
      return;
    }
    event.preventDefault();
    this.setPhoto({ zoom: this.photo().zoom * ZOOM_STEP_WHEEL ** (event.deltaY < 0 ? 1 : -1) });
  }

  protected onKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.05 : 0.01;
    const p = this.photo();
    const moves: Record<string, Partial<PhotoTransform>> = {
      ArrowLeft: { offsetX: p.offsetX - step },
      ArrowRight: { offsetX: p.offsetX + step },
      ArrowUp: { offsetY: p.offsetY - step },
      ArrowDown: { offsetY: p.offsetY + step },
      '+': { zoom: p.zoom * ZOOM_STEP_KEY },
      '=': { zoom: p.zoom * ZOOM_STEP_KEY },
      '-': { zoom: p.zoom / ZOOM_STEP_KEY },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      this.setPhoto(move);
    }
  }

  private update(change: Partial<FaceFrameState>): void {
    const next = { ...this.current(), ...change };
    this.current.set(next);
    this.state.set(next);
  }

  /** The stencil as drawn: with translated texts if options.translateStencilTexts is set. */
  private stencilConfig(stencil: Stencil): FrameConfig {
    const { translate, translateStencilTexts } = this.opts();
    if (!translateStencilTexts) {
      return stencil.config;
    }
    const c = stencil.config;
    const badge = c.badge && {
      ...c.badge,
      lines: c.badge.lines.map(translate),
      ...(c.badge.shape === 'diagonal' ? { title: translate(c.badge.title) } : {}),
    };
    return { ...c, texts: c.texts.map((t) => ({ ...t, text: translate(t.text) })), badge };
  }

  private findById(suffix: string): HTMLElement | null {
    const id = `${this.uid}-${suffix}`;
    return this.host.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  }

  private contrastLow(textColor: string): boolean {
    const o = this.opts();
    return (
      o.features.contrastWarning &&
      contrastRatio(textColor, ringBackground(this.custom(), o.palettes)) < o.minContrast
    );
  }

  private renderThumbnails(
    list: readonly Stencil[],
    image: HTMLImageElement | null,
    photo: PhotoTransform,
    key: string,
  ): void {
    let index = 0;
    const step = (): void => {
      if (key !== this.thumbKey) {
        return;
      }
      for (const s of list.slice(index, index + THUMB_BATCH)) {
        const config = this.stencilConfig(s);
        this.thumbCache.set(
          s.id,
          this.renderDataUrl(config, image, photo, THUMB_SIZE * 2, this.stencilImageFor(config)),
        );
      }
      index += THUMB_BATCH;
      this.thumbnails.set(this.thumbnailRecord());
      if (index < list.length) {
        requestAnimationFrame(step);
      }
    };
    if (list.length) {
      step();
    } else if (Object.keys(untracked(this.thumbnails)).length !== this.thumbCache.size) {
      this.thumbnails.set(this.thumbnailRecord());
    }
  }

  // null until the image is loaded
  private stencilImageFor(config: FrameConfig): HTMLImageElement | null {
    if (!config.image) {
      return null;
    }
    this.requestStencilImage(config.image);
    return this.stencilImages().get(config.image) ?? null;
  }

  private requestStencilImage(url: string): void {
    if (this.requestedImages.has(url)) {
      return;
    }
    this.requestedImages.add(url);
    loadStencilImage(url).then(
      (img) => this.stencilImages.update((images) => new Map(images).set(url, img)),
      (cause) => {
        this.requestedImages.delete(url);
        this.frameError.emit({ key: 'STENCIL_LOAD_FAILED', cause });
      },
    );
  }

  private thumbnailRecord(): Record<string, string> {
    // no prototype: ids are used as keys
    const result = Object.create(null) as Record<string, string>;
    this.thumbCache.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  private scrollToStencil(id: string, focus: boolean): void {
    requestAnimationFrame(() => {
      const el = this.findById(`st-${id}`);
      el?.scrollIntoView({ block: 'nearest' });
      if (focus) {
        el?.focus({ preventScroll: true });
      }
    });
  }

  // one export at a time, re-run once if the design changed in between
  private queueFramedChange(): void {
    if (this.exporting) {
      this.exportAgain = true;
      return;
    }
    this.exporting = true;
    void (async () => {
      do {
        this.exportAgain = false;
        try {
          const blob = await this.exportImage();
          if (this.shownInPhoto()) {
            this.framedChange.emit(blob);
          }
        } catch (cause) {
          this.frameError.emit({ key: 'EXPORT_FAILED', cause });
        }
      } while (this.exportAgain && this.shownInPhoto());
      this.exporting = false;
    })();
  }

  private renderDataUrl(
    config: FrameConfig,
    image: HTMLImageElement | null,
    photo: PhotoTransform,
    size: number,
    overlay: HTMLImageElement | null,
  ): string {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return '';
    }
    renderFrame(ctx, size, config, image, photo, undefined, overlay);
    try {
      return canvas.toDataURL('image/png');
    } catch (cause) {
      // tainted canvas, e.g. stencil image without CORS
      this.frameError.emit({ key: 'STENCIL_LOAD_FAILED', cause });
      return '';
    }
  }

  private async load(source: Blob | string | null): Promise<HTMLImageElement | null> {
    this.revokeObjectUrl();
    if (!source) {
      return null;
    }
    const img = new Image();
    if (typeof source === 'string') {
      // remote URLs need CORS, otherwise toBlob() fails on a tainted canvas
      img.crossOrigin = 'anonymous';
      img.src = source;
    } else {
      this.objectUrl = URL.createObjectURL(source);
      img.src = this.objectUrl;
    }
    await img.decode();
    return img;
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}

function searchText(s: Stencil, translate: (text: string) => string): string {
  const c = s.config;
  const badge = c.badge
    ? [...c.badge.lines, c.badge.shape === 'diagonal' ? c.badge.title : '']
    : [];
  const words = [
    s.label,
    s.category ?? '',
    ...(s.tags ?? []),
    ...c.texts.map((t) => t.text),
    ...badge,
  ];
  return [...words, ...words.map(translate)].join(' ').toLowerCase();
}
