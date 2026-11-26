import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import Konva from '../scene/konva';
import {
  DEFAULT_FACE_FRAME_OPTIONS,
  FACE_FRAME_OPTIONS,
  FaceFrameError,
  FaceFrameOptions,
  FaceFrameOptionsInput,
  MAX_EXPORT_SIZE,
  MIN_EXPORT_SIZE,
  mergeFaceFrameOptions,
  stencilFileName,
} from '../config/face-frame-options';
import {
  FaceFrameState,
  initialFaceFrameState,
  sanitizeBadgePosition,
  sanitizeFaceFrameState,
  sanitizePhoto,
} from '../config/face-frame-state';
import { DEFAULT_LABELS, FrameLabels } from '../config/frame-labels';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { FfIconComponent } from '../icon/ff-icon.component';
import { contrastRatio } from '../layout/contrast';
import {
  BADGE_SIZE,
  CustomFrameState,
  RING_WIDTH,
  buildCustomFrame,
  ringBackground,
} from '../layout/custom-frame';
import {
  BadgeIcon,
  ExportFormat,
  FrameConfig,
  PhotoTransform,
  Stencil,
} from '../models/frame.model';
import { SAFE_ID } from '../models/ids';
import { clamp } from '../models/numbers';
import { exportFrame, exportStencil } from '../scene/export-frame';
import { FrameScene, SceneContent } from '../scene/frame-scene';
import { InteractionLayer } from '../scene/interaction-layer';
import { ThumbnailRenderer } from '../scene/thumbnail-renderer';
import { withBadgeAt } from '../layout/badge-placement';
import { forgetTextMetrics } from '../layout/text-metrics';
import { withTextAt } from '../layout/text-placement';
import { BadgeMover } from './badge-mover';
import { StickerLayer } from './sticker-layer';
import { Sticker, withDraft } from '../stickers/sticker.model';
import { TextMover } from './text-mover';
import { loadStencilImage } from '../stencils/stencil-images';
import { Palette } from '../stencils/stencils';
import { EditorContext } from './editor-context';
import { PhotoLoader } from './photo-loader';
import { ServerSources } from './server-sources';
import { StencilFinder } from './stencil-finder';
import { StencilImageCache } from './stencil-image-cache';
import { StencilThumbnails } from './stencil-thumbnails';

// The FaceFrame editor on Konva: the preview is a Konva stage, the panel around it is plain Angular. Same inputs,
// outputs and saved state as the Canvas 2D editor, so a page can use either.

const ZOOM_STEP_BUTTON = 1.1;
const ZOOM_STEP_WHEEL = 1.06;
const ZOOM_STEP_KEY = 1.05;
const KEY_STEP = 0.01;
const KEY_STEP_LARGE = 0.05;
/** chat preview drawn at 96 px, shown at 48 and 32 px */
const SMALL_PREVIEW_SIZE = 96;
/** used when the page does not define --ff-primary */
const DEFAULT_SELECTION_COLOR = '#00646d';

type Tab = FaceFrameState['tab'];

let nextId = 0;

@Component({
  selector: 'app-face-frame-editor',
  imports: [NgTemplateOutlet, ColorPickerComponent, FfIconComponent],
  templateUrl: './face-frame-editor.component.html',
  styleUrls: [
    './face-frame-editor.component.scss',
    './face-frame-panel.scss',
    './face-frame-gallery.scss',
    './face-frame-stickers.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'onResize()' },
})
export class FaceFrameEditorComponent {
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
  /** the options with the premade stencils of stencils.json after the app's own */
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
  protected readonly colorNames = computed(() => {
    const { colorNames, translate } = this.opts();
    const translated = Object.create(null) as Record<string, string>;
    for (const hex of Object.keys(colorNames)) {
      translated[hex] = translate(colorNames[hex]);
    }
    return translated;
  });
  private readonly current = computed<FaceFrameState>(() => {
    const raw = this.state();
    const sanitized = sanitizeFaceFrameState(raw, this.opts());
    // keep a saved stencil from stencils.json (and its moved badge) while the list loads or has failed,
    // so the next change does not drop it
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
  protected readonly photo = computed(() => this.current().photo);
  protected readonly custom = computed(() => this.current().custom);
  protected readonly stencilId = computed(() => this.current().stencilId);
  protected readonly format = computed(() => this.current().downloadFormat);
  protected readonly windowWidth = signal(typeof window === 'undefined' ? 1920 : window.innerWidth);
  /** narrower than options.minWindowWidth: a note instead of the editor */
  protected readonly tooSmall = computed(() => this.windowWidth() < this.opts().minWindowWidth);
  protected readonly smallPreview = signal('');
  /** counts web fonts that finished loading: texts are measured again with the real font */
  private readonly fontsLoaded = signal(0);
  protected readonly badgePercent = computed(() => this.custom().badgeSize ?? BADGE_SIZE.initial);
  protected readonly bothTabs = computed(() => {
    const { customTab, stencilsTab } = this.opts().features;
    return customTab && stencilsTab;
  });
  protected readonly tab = computed<Tab>(() => {
    const { customTab, stencilsTab } = this.opts().features;
    if (!stencilsTab) {
      return 'custom';
    }
    return customTab ? this.current().tab : 'stencils';
  });
  protected readonly canCreateStencil = computed(
    () => this.opts().features.stencilCreationAllowed && this.tab() === 'custom',
  );
  protected readonly topContrastLow = computed(() => this.contrastLow(this.custom().topColor));
  protected readonly bottomContrastLow = computed(() =>
    this.contrastLow(this.custom().bottomColor),
  );

  protected readonly uid = `ffk${nextId++}`;
  protected readonly previewDescribedBy = computed(() =>
    [
      'drag-hint',
      this.stickers.active() ? 'sticker-hint' : '',
      this.badge.movable() ? 'badge-hint' : '',
      this.texts.movable() ? 'text-hint' : '',
    ]
      .filter(Boolean)
      .map((suffix) => `${this.uid}-${suffix}`)
      .join(' '),
  );
  protected readonly ringWidth = RING_WIDTH;
  protected readonly badgeSize = BADGE_SIZE;
  protected readonly ringStyles: readonly CustomFrameState['ringStyle'][] = [
    'solid',
    'gradient',
    'segments',
  ];

  private readonly context: EditorContext = {
    opts: this.opts,
    labels: this.labels,
    tab: this.tab,
    state: this.current,
    update: (change) => this.update(change),
    replaceState: (next) => this.state.set(next),
    patch: (change) => this.patch(change),
    // only one thing is selected at a time
    claimSelection: (part) => {
      if (part !== 'badge') {
        this.badge.deselect();
      }
      if (part !== 'text') {
        this.texts.deselect();
      }
      if (part !== 'sticker') {
        this.stickers.deselect();
      }
    },
    focusPreview: () => this.stageHost()?.nativeElement.focus({ preventScroll: true }),
    focusLater: (suffix) => requestAnimationFrame(() => this.findById(suffix)?.focus()),
    reportError: (error) => this.frameError.emit(error),
  };
  private readonly stencilImages = new StencilImageCache((error) => this.frameError.emit(error));
  protected readonly finder = new StencilFinder(this.context, {
    select: (id) => this.selectStencil(id),
    scrollTo: (id, focus) => this.scrollToStencil(id, focus),
  });
  /**
   * The stencil in the preview: the one the user picked. Until then the Premade stencils tab shows the customized
   * circle; without a Customized circle tab it shows the first stencil.
   */
  private readonly appliedStencil = computed(() => {
    if (this.tab() !== 'stencils') {
      return undefined;
    }
    return (
      this.finder.selected() ??
      (this.opts().features.customTab ? undefined : this.opts().stencils[0])
    );
  });
  /** The frame as designed: badge and texts where the design has them (moved ones are applied below). */
  private readonly designedConfig = computed<FrameConfig>(() => {
    // texts are fitted with the loaded font: once a web font arrives, everything is measured again
    this.fontsLoaded();
    const stencil = this.appliedStencil();
    if (stencil) {
      return this.stencilConfig(stencil);
    }
    const o = this.opts();
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
  protected readonly texts: TextMover = new TextMover(this.context, () => this.textsPlaced());
  private readonly textsPlaced: Signal<FrameConfig> = computed(() =>
    this.texts.applyTo(this.designedConfig()),
  );
  protected readonly badge: BadgeMover = new BadgeMover(this.context, {
    designed: this.designedConfig,
    withTexts: this.textsPlaced,
    drawn: () => this.config(),
    stencil: this.appliedStencil,
  });
  /** The frame as saved: what the page gets and what is exported. */
  readonly config: Signal<FrameConfig> = computed(() => this.badge.applyTo(this.textsPlaced()));
  /** Stickers belong to the customized circle: hidden (not deleted) while a premade stencil is applied. */
  protected readonly stickers = new StickerLayer(
    this.context,
    this.sources,
    () => this.appliedStencil() !== undefined,
  );
  /** The frame as shown in the preview, with a running drag of a text or the badge. */
  private readonly shownConfig = computed<FrameConfig>(() => {
    const textDraft = this.texts.draft();
    const config = textDraft
      ? this.badge.applyTo(withTextAt(this.textsPlaced(), textDraft.index, textDraft.center))
      : this.config();
    const badgeDraft = this.badge.draft();
    return badgeDraft ? withBadgeAt(config, badgeDraft) : config;
  });

  private readonly image = signal<HTMLImageElement | null>(null);
  readonly hasImage = computed(() => this.image() !== null);
  protected readonly loadError = signal(false);

  private readonly thumbnailRenderer = new ThumbnailRenderer();
  private readonly chatRenderer = new ThumbnailRenderer();
  private taintReported = false;
  protected readonly thumbnails = new StencilThumbnails(this.context, this.stencilImages, {
    image: this.image,
    photo: this.photo,
    visible: this.finder.visible,
    paused: computed(
      () =>
        this.draftPhoto() !== null ||
        this.badge.draft() !== null ||
        this.texts.draft() !== null ||
        this.stickers.draft() !== null,
    ),
    revision: this.fontsLoaded,
    config: (stencil) => this.stencilConfig(stencil),
    render: (config, image, photo, size, overlay) =>
      this.picture(
        this.thumbnailRenderer,
        { config, photo: image, transform: photo, stencilImage: overlay },
        size,
      ),
  });
  /** a saved stencil may come with stencils.json: nothing is drawn or sent until it is there */
  private readonly waitingForManifest = computed(
    () =>
      this.sources.manifestPending() &&
      this.tab() === 'stencils' &&
      (!!this.stencilId() || !this.opts().features.customTab) &&
      !this.opts().stencils.some((s) => s.id === this.stencilId()),
  );

  private readonly previewSize = computed(() => this.opts().previewSize);
  /** the photo while it is dragged; saved once on release */
  private readonly draftPhoto = signal<Pick<PhotoTransform, 'offsetX' | 'offsetY'> | null>(null);
  private readonly scene = signal<FrameScene | null>(null);
  private readonly interaction = signal<InteractionLayer | null>(null);
  /** the preview element; missing while the server settings load */
  private readonly stageHost = viewChild<ElementRef<HTMLDivElement>>('stage');
  private readonly loader = new PhotoLoader();
  private exporting = false;
  private exportAgain = false;

  // the editor's effects, in the order they run; each method creates one effect
  constructor() {
    this.keepStageInHost();
    this.remeasureWhenFontsLoad();
    this.loadPhotoOnSourceChange();
    this.drawPreview();
    this.reportChanges();
    inject(DestroyRef).onDestroy(() => {
      this.thumbnailRenderer.destroy();
      this.chatRenderer.destroy();
      this.loader.release();
    });
  }

  /** a stage per preview element and size */
  private keepStageInHost(): void {
    effect((onCleanup) => {
      const host = this.stageHost()?.nativeElement;
      if (!host) {
        return;
      }
      const stage = this.createStage(host, this.previewSize());
      onCleanup(() => {
        this.scene.set(null);
        this.interaction.set(null);
        stage.destroy();
      });
    });
  }

  private remeasureWhenFontsLoad(): void {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    const remeasure = (): void => {
      forgetTextMetrics();
      this.fontsLoaded.update((n) => n + 1);
    };
    fonts?.addEventListener('loadingdone', remeasure);
    inject(DestroyRef).onDestroy(() => fonts?.removeEventListener('loadingdone', remeasure));
  }

  private loadPhotoOnSourceChange(): void {
    effect((onCleanup) => {
      const source = this.source();
      let cancelled = false;
      onCleanup(() => (cancelled = true));
      // the image hosts are read once per photo: an options change must not load the photo again
      const imageHosts = untracked(() => this.opts().imageHosts);
      this.loader.load(source, imageHosts).then(
        (img) => {
          if (!cancelled) {
            this.image.set(img);
            this.loadError.set(false);
            this.ready.emit(img !== null);
          }
        },
        (cause: unknown) => {
          if (!cancelled) {
            this.image.set(null);
            this.loadError.set(true);
            this.ready.emit(false);
            this.frameError.emit({ key: 'LOAD_FAILED', cause });
          }
        },
      );
    });
  }

  /** the preview with the running drag, and the grab areas above it */
  private drawPreview(): void {
    effect(() => {
      const scene = this.scene();
      if (!scene || this.waitingForManifest()) {
        return;
      }
      const image = this.image();
      const config = this.shownConfig();
      const stickers = withDraft(this.stickers.list(), this.stickers.draft());
      const geometry = scene.render(
        this.sceneContent(config, { ...this.photo(), ...this.draftPhoto() }, stickers),
      );
      scene.photoNode.draggable(image !== null);
      scene.layer.batchDraw();
      const canMove = image !== null;
      this.interaction()?.update({
        geometry,
        badge: canMove ? this.badge.circleIn(config) : null,
        badgeSelected: this.badge.selected(),
        texts: canMove ? this.texts.arcsIn(config) : [],
        textSelected: this.texts.selected(),
        stickers: canMove && this.stickers.active() ? stickers : [],
        stickerSelected: this.stickers.selected()?.id ?? null,
        color: this.primaryColor(),
      });
    });
  }

  /** a saved change of the design: tell the page, and send the framed photo when it is shown in the photo */
  private reportChanges(): void {
    effect(() => {
      // nothing is emitted while the server settings or stencils.json load (as in the Canvas 2D version)
      if (this.sources.waitingForSettings() || this.waitingForManifest()) {
        return;
      }
      const config = this.config();
      const photo = this.photo();
      // the framed photo is sent again when the stickers change, or an image sticker has arrived
      const stickers = this.stickers.list();
      this.stickers.imagesInUse();
      if (this.opts().features.chatPreview) {
        const content = this.sceneContent(config, photo, stickers);
        untracked(() =>
          this.smallPreview.set(this.picture(this.chatRenderer, content, SMALL_PREVIEW_SIZE)),
        );
      }
      this.changed.emit({ config, photo });
      if (this.image() && untracked(this.shownInPhoto)) {
        // reports its own errors (frameError), so nothing is left to await here
        void this.queueFramedChange();
      }
    });
  }

  /** What the preview and the chat preview draw; read inside an effect, so it tracks what it reads. */
  private sceneContent(
    config: FrameConfig,
    transform: PhotoTransform,
    stickers: readonly Sticker[],
  ): SceneContent {
    return {
      config,
      revision: this.fontsLoaded(),
      photo: this.image(),
      transform,
      stencilImage: this.stencilImages.imageFor(config),
      stickers,
      stickerImages: this.stickers.loadedImages(),
    };
  }

  /** The framed photo as a file (default: options.export); used for the upload. */
  async exportImage(size?: number, format?: ExportFormat): Promise<Blob> {
    // with the server's settings (e.g. the export size); a loop, because a new settingsUrl starts a new load
    while (this.sources.waitingForSettings()) {
      await this.sources.settingsLoaded();
    }
    const image = this.image();
    if (!image) {
      throw new Error('No photo loaded');
    }
    // the design as it is now; the loads below must not mix in a later change
    const o = this.opts();
    const config = this.config();
    const transform = this.photo();
    const stickers = this.stickers.list();
    const stencilImage = config.image ? await loadStencilImage(config.image) : null;
    const stickerImages = stickers.length ? await this.stickers.imagesForExport() : undefined;
    const outputSize =
      size === undefined ? o.export.size : clamp(size, MIN_EXPORT_SIZE, MAX_EXPORT_SIZE);
    return exportFrame(
      { config, photo: image, transform, stencilImage, stickers, stickerImages },
      outputSize,
      format ?? o.export.format,
    );
  }

  /** Back to the start design; saved stickers stay while the sticker feature is off. */
  reset(): void {
    this.stickers.clear();
    this.badge.clear();
    this.texts.clear();
    const initial = initialFaceFrameState(this.opts());
    // like every other change, a reset leaves saved stickers alone while the feature is off
    const { stickers } = this.current();
    this.state.set(this.opts().features.stickers || !stickers ? initial : { ...initial, stickers });
  }

  protected setFormat(format: ExportFormat): void {
    this.update({ downloadFormat: format });
  }

  protected formatLabel(format: ExportFormat): string {
    return format === 'image/jpeg' ? 'JPG' : 'PNG';
  }

  protected onResize(): void {
    this.windowWidth.set(window.innerWidth);
  }

  protected async onShowInPhoto(): Promise<void> {
    try {
      this.showInPhoto.emit(await this.exportImage());
    } catch (cause) {
      this.frameError.emit({ key: 'EXPORT_FAILED', cause });
    }
  }

  /** Saves the framed photo as a file (options.download: size, file name). */
  protected async download(): Promise<void> {
    const { size, fileName } = this.opts().download;
    const format = this.format();
    try {
      const blob = await this.exportImage(size, format);
      const name = `${fileName}.${format === 'image/jpeg' ? 'jpg' : 'png'}`;
      this.saveFile(blob, name);
      this.downloaded.emit({ blob, fileName: name });
    } catch (cause) {
      this.frameError.emit({ key: 'DOWNLOAD_FAILED', cause });
    }
  }

  /** The customized circle without the photo, as a 1024 px PNG for the stencil zip; not a `downloaded` event. */
  protected async downloadStencil(): Promise<void> {
    try {
      // always the stencil size, whatever the download size is
      const blob = await exportStencil(this.config(), this.fontsLoaded());
      this.saveFile(blob, stencilFileName(this.opts().download.fileName));
    } catch (cause) {
      this.frameError.emit({ key: 'DOWNLOAD_FAILED', cause });
    }
  }

  private saveFile(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  protected resetPositions(): void {
    if (this.badge.moved()) {
      this.badge.reset();
    }
    if (this.texts.moved()) {
      this.texts.reset();
    }
  }

  protected resetPhoto(): void {
    this.update({ photo: initialFaceFrameState(this.opts()).photo });
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.hasImage()) {
      return;
    }
    event.preventDefault();
    this.setPhoto({ zoom: this.photo().zoom * ZOOM_STEP_WHEEL ** (event.deltaY < 0 ? 1 : -1) });
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.interaction()?.stop();
    }
    if (
      !this.hasImage() ||
      this.badge.keyDown(event) ||
      this.texts.keyDown(event) ||
      this.stickers.keyDown(event)
    ) {
      return;
    }
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const p = this.photo();
    const moves: Readonly<Partial<Record<string, Partial<PhotoTransform>>>> = {
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

  protected patch(change: Partial<CustomFrameState>): void {
    this.update({ custom: { ...this.custom(), ...change } });
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

  /** Left / right arrow switch between the two tabs (tablist keyboard pattern). */
  protected onTabKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next: Tab = this.tab() === 'custom' ? 'stencils' : 'custom';
    this.selectTab(next);
    document.getElementById(`${this.uid}-tab-${next}`)?.focus();
  }

  protected tr(text: string): string {
    return this.opts().translate(text);
  }

  protected ringStyleLabel(style: CustomFrameState['ringStyle']): string {
    const t = this.labels();
    return { solid: t.styleSolid, gradient: t.styleGradient, segments: t.styleSegments }[style];
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

  protected paletteGradient(palette: Palette): string {
    return `linear-gradient(90deg, ${palette.colors.join(', ')})`;
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

  private update(change: Partial<FaceFrameState>): void {
    this.state.set({ ...this.current(), ...change });
  }

  private createStage(host: HTMLDivElement, size: number): Konva.Stage {
    const stage = new Konva.Stage({ container: host, width: size, height: size });
    const scene = new FrameScene(size);
    const interaction = new InteractionLayer(size, {
      badgeDown: (p) => this.badge.startDrag(p),
      badgeMove: (p) => this.badge.dragTo(p),
      badgeUp: () => this.badge.endDrag(),
      textDown: (index, p) => this.texts.startDrag(index, p),
      textMove: (p) => this.texts.dragTo(p),
      textUp: () => this.texts.endDrag(),
      stickerDown: (id) => this.stickers.select(id),
      stickerChange: (draft) => this.stickers.preview(draft),
      stickerUp: (result) => this.stickers.commit(result),
    });
    stage.add(scene.layer, interaction.layer);
    // as the Canvas 2D version: at most 3 device pixels per CSS pixel (memory on 4x screens)
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    for (const layer of [scene.layer, interaction.layer]) {
      layer.getCanvas().setPixelRatio(ratio);
    }
    // a press on the photo (or next to it) ends the badge and text selection; every press focuses the preview
    stage.on('pointerdown', (event) => {
      host.focus({ preventScroll: true });
      if (!interaction.owns(event.target)) {
        this.badge.deselect();
        this.texts.deselect();
        this.stickers.deselect();
      }
    });
    // a click selects only; a real drag is saved by its dragend, whichever event comes first
    stage.on('pointerup', () => {
      this.badge.releaseWithoutMove();
      this.texts.releaseWithoutMove();
    });
    this.makePhotoDraggable(scene, host);
    this.scene.set(scene);
    this.interaction.set(interaction);
    return stage;
  }

  /** A small picture as an image URL; '' when the canvas is tainted (a stencil image without CORS). */
  private picture(renderer: ThumbnailRenderer, content: SceneContent, size: number): string {
    try {
      return renderer.render(content, size);
    } catch (cause) {
      // reported once, not on every change
      if (!this.taintReported) {
        this.taintReported = true;
        this.frameError.emit({ key: 'STENCIL_LOAD_FAILED', cause });
      }
      return '';
    }
  }

  /** the page's --ff-primary, read on every render so a theme switch is followed */
  private primaryColor(): string {
    return (
      getComputedStyle(this.host.nativeElement).getPropertyValue('--ff-primary').trim() ||
      DEFAULT_SELECTION_COLOR
    );
  }

  private makePhotoDraggable(scene: FrameScene, host: HTMLElement): void {
    const node = scene.photoNode;
    // the photo center stays within half a photo circle of the frame center, like the saved offsets
    node.dragBoundFunc((pos) => {
      const { offsetX, offsetY } = scene.offsetsAt(pos.x, pos.y);
      const p = sanitizePhoto({ ...this.photo(), offsetX, offsetY }, this.opts());
      return scene.positionOf(p);
    });
    node.on('dragstart', () => host.focus({ preventScroll: true }));
    // only the position is dragged: a zoom or turn meanwhile (wheel, keys) is kept
    node.on('dragmove', () => this.draftPhoto.set(scene.offsetsAt(node.x(), node.y())));
    node.on('dragend', () => {
      const draft = this.draftPhoto();
      this.draftPhoto.set(null);
      if (draft) {
        this.setPhoto(draft);
      }
    });
  }

  /** Sends the framed photo to the page; changes during an export are sent once afterwards. */
  private async queueFramedChange(): Promise<void> {
    if (this.exporting) {
      this.exportAgain = true;
      return;
    }
    this.exporting = true;
    try {
      do {
        this.exportAgain = false;
        this.framedChange.emit(await this.exportImage());
      } while (this.exportAgain);
    } catch (cause) {
      this.frameError.emit({ key: 'EXPORT_FAILED', cause });
    } finally {
      this.exporting = false;
    }
  }
}
