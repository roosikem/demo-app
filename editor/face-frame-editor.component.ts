import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  Signal,
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
  BADGE_SIZE,
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
  sanitizeBadgePosition,
  sanitizeFaceFrameState,
  sanitizePhoto,
} from '../config/face-frame-state';
import { DEFAULT_LABELS, FrameLabels } from '../config/frame-labels';
import {
  JPEG_BACKGROUND,
  bubblePlacement,
  canvasToBlob,
  contrastRatio,
  geometry,
  renderFrame,
  renderToBlob,
  solidRingColor,
} from '../rendering/frame-renderer';
import { loadStencilImage } from '../rendering/stencil-images';
import { isRoundBadge } from '../rendering/badge-position';
import { textArc, withTextAt } from '../rendering/text-position';
import {
  BadgeIcon,
  ExportFormat,
  FrameConfig,
  PhotoTransform,
  Stencil,
} from '../models/frame.model';
import { Palette } from '../stencils/stencils';
import { NO_STICKERS, Sticker, withDraft } from '../stickers/sticker.model';
import { SAFE_ID } from '../models/ids';
import {
  drawArcSelection,
  drawCircleSelection,
  drawSelection,
  drawStickers,
} from '../stickers/sticker-drawing';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { FfIconComponent } from '../icon/ff-icon.component';
import { BadgeMover, withBadgeAt } from './badge-mover';
import { EditorContext, Selectable, Tab } from './editor-context';
import { StencilImageCache } from './stencil-image-cache';
import { TextMeasure } from './text-measure';
import { ServerSources } from './server-sources';
import { StencilFinder } from './stencil-finder';
import { StencilThumbnails } from './stencil-thumbnails';
import { StickerLayer } from './sticker-layer';
import { TextMover } from './text-mover';

// The FaceFrame editor: puts a frame around the user's profile photo and exports the result.
// The component wires the parts together (see editor-context.ts); each part lives in its own file.

const ZOOM_STEP_BUTTON = 1.1;
const ZOOM_STEP_WHEEL = 1.06;
const ZOOM_STEP_KEY = 1.05;
const SMALL_PREVIEW_SIZE = 96;
// used when the page does not define --ff-primary
const SELECTION_COLOR = '#00646d';

let nextId = 0;

@Component({
  selector: 'app-face-frame-editor',
  imports: [ColorPickerComponent, FfIconComponent],
  templateUrl: './face-frame-editor.component.html',
  styleUrls: [
    './face-frame-editor.component.scss',
    './face-frame-controls.scss',
    './face-frame-gallery.scss',
    './face-frame-stickers.scss',
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly sources: ServerSources = new ServerSources({
    // set by the app, never by the server settings themselves
    settingsUrl: () => {
      const url = this.options()?.settingsUrl ?? this.appOptions?.settingsUrl;
      return typeof url === 'string' ? url : null;
    },
    manifestUrl: (): string | null => this.baseOpts().stencilManifest,
    settingsFallback: () => this.opts().settingsFallback,
    reportError: (error) => this.frameError.emit(error),
  });
  private readonly baseOpts: Signal<FaceFrameOptions> = computed(() =>
    mergeFaceFrameOptions(
      DEFAULT_FACE_FRAME_OPTIONS,
      this.appOptions,
      this.options(),
      this.sources.settings(),
    ),
  );
  protected readonly opts = computed<FaceFrameOptions>(() => {
    const base = this.baseOpts();
    const fromServer = this.sources.stencils();
    return fromServer.length
      ? mergeFaceFrameOptions(base, { stencils: [...base.stencils, ...fromServer] })
      : base;
  });
  protected readonly labels = computed<FrameLabels>(() => ({
    ...DEFAULT_LABELS,
    ...this.opts().labels,
  }));
  protected readonly features = computed(() => this.opts().features);
  protected readonly colorNames = computed(() => {
    const { colorNames, translate } = this.opts();
    const translated = Object.create(null) as Record<string, string>;
    for (const hex of Object.keys(colorNames)) {
      translated[hex] = translate(colorNames[hex]);
    }
    return translated;
  });
  protected readonly bothTabs = computed(
    () => this.features().customTab && this.features().stencilsTab,
  );

  protected readonly uid = `ff${nextId++}`;
  protected readonly ringWidth = RING_WIDTH;
  protected readonly badgeSize = BADGE_SIZE;
  protected readonly ringStyles: readonly CustomFrameState['ringStyle'][] = [
    'solid',
    'gradient',
    'segments',
  ];

  // the parent's [(state)] if set, otherwise the defaults
  private readonly current = linkedSignal<FaceFrameState>(() => {
    const raw = this.state();
    const sanitized = sanitizeFaceFrameState(raw, this.opts());
    // keep a saved stencil from stencils.json (and its moved badge) while the list loads or has failed,
    // so the next change does not save the default stencil instead
    const status = this.sources.manifestStatus();
    const savedId = raw?.stencilId;
    if (
      (status === 'pending' || status === 'failed') &&
      typeof savedId === 'string' &&
      savedId !== sanitized.stencilId &&
      SAFE_ID.test(savedId)
    ) {
      const badge = raw?.stencilBadge;
      const position = badge?.stencilId === savedId ? sanitizeBadgePosition(badge) : null;
      return position
        ? { ...sanitized, stencilId: savedId, stencilBadge: { stencilId: savedId, ...position } }
        : { ...sanitized, stencilId: savedId };
    }
    return sanitized;
  });
  protected readonly tab = computed<Tab>(() => {
    const { customTab, stencilsTab } = this.features();
    if (!stencilsTab) {
      return 'custom';
    }
    return customTab ? this.current().tab : 'stencils';
  });
  protected readonly custom = computed(() => this.current().custom);
  protected readonly badgePercent = computed(() => this.custom().badgeSize ?? BADGE_SIZE.initial);
  protected readonly stencilId = computed(() => this.current().stencilId);
  protected readonly photo = computed(() => this.current().photo);
  protected readonly format = computed(() => this.current().downloadFormat);

  private readonly context: EditorContext = {
    opts: this.opts,
    labels: this.labels,
    tab: this.tab,
    state: this.current,
    update: (change) => this.update(change),
    replaceState: (next) => this.replaceState(next),
    patch: (change) => this.patch(change),
    claimSelection: (part) => this.claimSelection(part),
    focusPreview: () => this.canvas()?.nativeElement.focus(),
    focusLater: (suffix) => requestAnimationFrame(() => this.findById(suffix)?.focus()),
    reportError: (error) => this.frameError.emit(error),
  };
  private readonly measure = new TextMeasure();
  private readonly stencilImages = new StencilImageCache((error) => this.frameError.emit(error));

  protected readonly finder = new StencilFinder(this.context, {
    select: (id) => this.selectStencil(id),
    scrollTo: (id, focus) => this.scrollToStencil(id, focus),
  });
  /** the stencil in the preview: the first one while the saved stencil is not (yet) available */
  private readonly shownStencil = computed(() => this.finder.selected() ?? this.opts().stencils[0]);

  /** The frame as designed, with the badge at its designed place. */
  private readonly designedConfig = computed<FrameConfig>(() => {
    const o = this.opts();
    const stencil = this.tab() === 'stencils' ? this.shownStencil() : undefined;
    if (stencil) {
      return this.stencilConfig(stencil);
    }
    const custom = o.features.textMove
      ? { ...this.custom(), badgePosition: undefined }
      : {
          ...this.custom(),
          badgePosition: undefined,
          topTextAngle: undefined,
          bottomTextAngle: undefined,
        };
    return buildCustomFrame(custom, o.palettes, {
      text: o.textMaxLength,
      badgeLine: o.badgeLineMaxLength,
    });
  });
  protected readonly texts: TextMover = new TextMover(this.context, this.measure, () =>
    this.textsPlaced(),
  );
  private readonly textsPlaced: Signal<FrameConfig> = computed(() =>
    this.texts.applyTo(this.designedConfig()),
  );
  protected readonly badge: BadgeMover = new BadgeMover(this.context, this.measure, {
    designed: this.designedConfig,
    withTexts: this.textsPlaced,
    drawn: () => this.config(),
    stencil: this.shownStencil,
  });
  readonly config: Signal<FrameConfig> = computed(() => this.badge.applyTo(this.textsPlaced()));

  protected readonly stickers = new StickerLayer(this.context, this.sources);

  private readonly image = signal<HTMLImageElement | null>(null);
  readonly hasImage = computed(() => this.image() !== null);
  protected readonly loadError = signal(false);
  private readonly dragging = signal(false);

  protected readonly thumbnails = new StencilThumbnails(this.context, this.stencilImages, {
    image: this.image,
    photo: this.photo,
    visible: this.finder.visible,
    paused: this.dragging,
    config: (stencil) => this.stencilConfig(stencil),
    render: (config, image, photo, size, overlay) =>
      this.dataUrl(config, image, photo, size, overlay),
  });

  protected readonly windowWidth = signal(typeof window === 'undefined' ? 1920 : window.innerWidth);
  protected readonly tooSmall = computed(() => this.windowWidth() < this.opts().minWindowWidth);
  protected readonly topContrastLow = computed(() => this.contrastLow(this.custom().topColor));
  protected readonly bottomContrastLow = computed(() =>
    this.contrastLow(this.custom().bottomColor),
  );
  protected readonly previewDescribedBy = computed(() =>
    [
      'drag-hint',
      this.features().stickers ? 'sticker-hint' : '',
      this.badge.movable() ? 'badge-hint' : '',
      this.texts.movable() ? 'text-hint' : '',
    ]
      .filter(Boolean)
      .map((suffix) => `${this.uid}-${suffix}`)
      .join(' '),
  );
  protected readonly smallPreview = signal('');

  // the saved stencil may come with stencils.json: draw and emit nothing until it is there
  private readonly waitingForManifest = computed(
    () =>
      this.sources.manifestPending() &&
      this.tab() === 'stencils' &&
      !this.opts().stencils.some((s) => s.id === this.stencilId()),
  );
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('preview');
  private objectUrl: string | null = null;
  private drag: { pointerId: number; x: number; y: number; start: PhotoTransform } | null = null;
  private exporting = false;
  private exportAgain = false;
  private taintReported = false;
  private selectionColor: string | null = null;

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

    // a design change: draw, emit `changed` and, when shown in the photo, `framedChange`
    effect(() => {
      const canvas = this.canvas()?.nativeElement;
      const config = this.config();
      const photo = this.photo();
      const image = this.image();
      const stickers = this.stickers.list();
      // a design with image stickers is drawn and sent again once stencils.json has offered them
      this.stickers.imagesInUse();
      const cssSize = this.opts().previewSize;
      // no canvas while the settings load (the template waits for them)
      if (!canvas || this.waitingForManifest()) {
        return;
      }
      const overlay = this.stencilImages.imageFor(config);
      untracked(() => this.paintPreview(canvas, cssSize, overlay));
      if (untracked(this.features).chatPreview) {
        this.smallPreview.set(
          this.dataUrl(config, image, photo, SMALL_PREVIEW_SIZE, overlay, stickers),
        );
      }
      this.changed.emit({ config, photo });
      if (image && untracked(this.shownInPhoto)) {
        this.queueFramedChange();
      }
    });

    // drags and selections only repaint the preview: the design has not changed yet
    effect(() => {
      const { stickers, badgeMove, textMove } = this.features();
      if (!stickers && !badgeMove && !textMove) {
        return;
      }
      this.stickers.draft();
      this.stickers.selected();
      this.stickers.loadedImages();
      this.badge.draft();
      this.badge.selected();
      this.texts.draft();
      this.texts.selected();
      // a new canvas is painted by the render effect
      untracked(() => {
        const canvas = this.canvas()?.nativeElement;
        if (canvas && !this.waitingForManifest()) {
          this.paintPreview(
            canvas,
            this.opts().previewSize,
            this.stencilImages.imageFor(this.config()),
          );
        }
      });
    });

    effect(() => {
      if (this.stickers.loadedImages().size && this.features().chatPreview) {
        untracked(() => this.refreshSmallPreview());
      }
    });
  }

  ngOnDestroy(): void {
    this.revokeObjectUrl();
  }

  async exportImage(size?: number, format?: ExportFormat): Promise<Blob> {
    // with the server's settings (e.g. the export size), once the editor has rendered;
    // a loop, because a new settingsUrl starts a new load
    while (this.sources.waitingForSettings()) {
      await this.sources.settingsLoaded();
    }
    const image = this.image();
    if (!image) {
      throw new Error('No photo loaded');
    }
    const o = this.opts();
    const config = this.config();
    const photo = this.photo();
    const overlay = config.image ? await loadStencilImage(config.image) : null;
    const outputSize = size ?? o.export.size;
    const outputFormat = format ?? o.export.format;
    const stickers = this.stickers.list();
    if (!stickers.length) {
      return renderToBlob(config, image, photo, outputSize, outputFormat, overlay);
    }
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D is not available');
    }
    const background = outputFormat === 'image/jpeg' ? JPEG_BACKGROUND : undefined;
    const images = await this.stickers.imagesForExport();
    renderFrame(ctx, outputSize, config, image, photo, background, overlay);
    drawStickers(ctx, outputSize, stickers, images);
    return canvasToBlob(canvas, outputFormat);
  }

  reset(): void {
    this.stickers.clear();
    this.badge.clear();
    this.texts.clear();
    const initial = initialFaceFrameState(this.opts());
    // like every other change, a reset leaves saved stickers alone while the feature is off
    const { stickers } = this.current();
    this.replaceState(this.features().stickers || !stickers ? initial : { ...initial, stickers });
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
    const t = this.labels();
    return {
      none: t.iconNone,
      check: t.iconCheck,
      star: t.iconStar,
      heart: t.iconHeart,
      cloud: t.iconCloud,
    }[icon];
  }

  protected ringStyleLabel(style: CustomFrameState['ringStyle']): string {
    const t = this.labels();
    return { solid: t.styleSolid, gradient: t.styleGradient, segments: t.styleSegments }[style];
  }

  protected paletteGradient(palette: Palette): string {
    return `linear-gradient(90deg, ${palette.colors.join(', ')})`;
  }

  protected formatLabel(format: ExportFormat): string {
    return format === 'image/jpeg' ? 'JPG' : 'PNG';
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected inputNumber(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected inputChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  // A press goes to the first part that takes it: sticker, badge, text, otherwise the photo.

  protected onPointerDown(event: PointerEvent): void {
    if (!this.hasImage() || !event.isPrimary || event.button !== 0) {
      return;
    }
    const canvas = event.currentTarget as HTMLElement;
    if (
      (this.features().stickers && this.stickers.gestures.pointerDown(event, canvas)) ||
      (this.features().badgeMove && this.badge.gestures.pointerDown(event, canvas)) ||
      (this.texts.movable() && this.texts.gestures.pointerDown(event, canvas))
    ) {
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
    const target = event.currentTarget as HTMLElement;
    if (
      this.stickerStep(event, () => this.stickers.gestures.pointerMove(event, target)) ||
      this.badge.gestures.pointerMove(event, target) ||
      this.texts.gestures.pointerMove(event, target)
    ) {
      return;
    }
    if (this.drag?.pointerId !== event.pointerId) {
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
    const target = event.currentTarget as HTMLElement;
    if (
      this.stickerStep(event, () => this.stickers.gestures.pointerUp(event, target)) ||
      this.badge.gestures.pointerUp(event, target) ||
      this.texts.gestures.pointerUp(event, target)
    ) {
      return;
    }
    if (this.drag?.pointerId === event.pointerId) {
      this.drag = null;
      this.dragging.set(false);
    }
  }

  /** pointercancel / lostpointercapture: a sticker, badge or text drag is dropped, a photo drag ends */
  protected onPointerCancel(event: PointerEvent): void {
    if (
      !this.stickers.gestures.cancel(event.pointerId) &&
      !this.badge.gestures.cancel(event.pointerId) &&
      !this.texts.gestures.cancel(event.pointerId)
    ) {
      this.onPointerUp(event);
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
    if (
      this.badge.gestures.keyDown(event) ||
      this.texts.gestures.keyDown(event) ||
      (this.features().stickers && this.stickers.gestures.keyDown(event))
    ) {
      return;
    }
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

  /** A sticker gesture that is still running after the feature was switched off is dropped. */
  private stickerStep(event: PointerEvent, step: () => boolean): boolean {
    return this.features().stickers ? step() : this.stickers.gestures.cancel(event.pointerId);
  }

  private claimSelection(part: Selectable): void {
    if (part !== 'sticker') {
      this.stickers.deselect();
    }
    if (part !== 'badge') {
      this.badge.deselect();
    }
    if (part !== 'text') {
      this.texts.deselect();
    }
  }

  private paintPreview(
    canvas: HTMLCanvasElement,
    cssSize: number,
    overlay: HTMLImageElement | null,
  ): void {
    const size = Math.round(cssSize * Math.min(3, window.devicePixelRatio || 1));
    // check both: a new canvas is 300x150, so the width alone can already match
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const textDraft = this.texts.draft();
    const config = textDraft
      ? this.badge.applyTo(withTextAt(this.textsPlaced(), textDraft.index, textDraft.center))
      : this.config();
    const badgeDraft = this.badge.draft();
    const shown = badgeDraft === null ? config : withBadgeAt(config, badgeDraft);
    renderFrame(ctx, size, shown, this.image(), this.photo(), undefined, overlay);
    const stickerDraft = this.stickers.draft();
    drawStickers(
      ctx,
      size,
      withDraft(this.stickers.list(), stickerDraft),
      this.stickers.loadedImages(),
    );
    this.paintSelection(canvas, ctx, size, shown, stickerDraft);
  }

  /** preview only, never exported */
  private paintSelection(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    size: number,
    shown: FrameConfig,
    stickerDraft: Sticker | null,
  ): void {
    const sticker = this.stickers.selected();
    const badge = this.badge.selected() && isRoundBadge(shown) ? shown.badge : null;
    const text = this.texts.selected();
    if (!sticker && !badge && text === null) {
      return;
    }
    // read once: getComputedStyle on every drag frame is not needed for a theme color
    this.selectionColor ??=
      getComputedStyle(canvas).getPropertyValue('--ff-primary').trim() || SELECTION_COLOR;
    if (sticker) {
      drawSelection(ctx, size, stickerDraft ?? sticker, this.selectionColor);
    }
    if (badge) {
      const { x, y, r, gapWidth } = bubblePlacement(
        geometry(size, shown),
        badge,
        solidRingColor(shown.ring),
      );
      drawCircleSelection(ctx, size, { x, y, r: r + gapWidth }, this.selectionColor);
    }
    const measure = text === null ? null : this.measure.ctx();
    if (text !== null && measure && shown.texts[text]) {
      const { center, half } = textArc(measure, shown, text);
      drawArcSelection(ctx, size, geometry(size, shown), center, half, this.selectionColor);
    }
  }

  private update(change: Partial<FaceFrameState>): void {
    this.replaceState({ ...this.current(), ...change });
  }

  private replaceState(next: FaceFrameState): void {
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
      lines: c.badge.lines.map((line) => translate(line)),
      ...(c.badge.shape === 'diagonal' ? { title: translate(c.badge.title) } : {}),
    };
    return { ...c, texts: c.texts.map((t) => ({ ...t, text: translate(t.text) })), badge };
  }

  private findById(suffix: string): HTMLElement | null {
    const id = `${this.uid}-${suffix}`;
    return this.host.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
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

  private contrastLow(textColor: string): boolean {
    const o = this.opts();
    return (
      o.features.contrastWarning &&
      contrastRatio(textColor, ringBackground(this.custom(), o.palettes)) < o.minContrast
    );
  }

  // one export at a time, run once more if the design changed in between
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

  /** The chat preview drawn again without a design change (a sticker image has arrived). */
  private refreshSmallPreview(): void {
    const config = this.config();
    if (this.waitingForManifest()) {
      return;
    }
    this.smallPreview.set(
      this.dataUrl(
        config,
        this.image(),
        this.photo(),
        SMALL_PREVIEW_SIZE,
        this.stencilImages.imageFor(config),
        this.stickers.list(),
      ),
    );
  }

  private dataUrl(
    config: FrameConfig,
    image: HTMLImageElement | null,
    photo: PhotoTransform,
    size: number,
    overlay: HTMLImageElement | null,
    stickers: readonly Sticker[] = NO_STICKERS,
  ): string {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return '';
    }
    renderFrame(ctx, size, config, image, photo, undefined, overlay);
    drawStickers(ctx, size, stickers, untracked(this.stickers.loadedImages));
    try {
      return canvas.toDataURL('image/png');
    } catch (cause) {
      // tainted canvas, e.g. a stencil image without CORS; reported once, not on every render
      if (!this.taintReported) {
        this.taintReported = true;
        this.frameError.emit({ key: 'STENCIL_LOAD_FAILED', cause });
      }
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
