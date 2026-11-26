import { computed, effect, signal, untracked } from '@angular/core';
import { FaceFrameError, FaceFrameOptionsInput } from '../config/face-frame-options';
import { checkSettings, loadSettings } from '../config/face-frame-settings';
import { StencilManifest, loadStencilManifest } from '../config/stencil-manifest';
import { Stencil } from '../models/frame.model';
import { NO_STICKER_IMAGES, StickerImage } from '../stickers/sticker.model';

// Loads what the editor gets from the server:
// - face-frame-settings.json: settings that win over the app's options
// - stencils.json: the premade stencils and the image stickers
// A file that is missing or broken changes nothing; the editor then works with what the app has.

export interface ServerSourcesHost {
  settingsUrl(): string | null;
  manifestUrl(): string | null;
  settingsFallback(): boolean;
  reportError(error: FaceFrameError): void;
}

type ManifestStatus = 'none' | 'pending' | 'ready' | 'failed';

const NO_STENCILS: readonly Stencil[] = Object.freeze([]);

export class ServerSources {
  readonly settings = signal<FaceFrameOptionsInput>({});
  /** true while the settings load: the editor shows and draws nothing yet */
  readonly waitingForSettings = signal(false);
  readonly stencils = signal<readonly Stencil[]>(NO_STENCILS);
  readonly stickerImages = signal<readonly StickerImage[]>(NO_STICKER_IMAGES);
  readonly manifestStatus = signal<ManifestStatus>('none');
  readonly manifestPending = computed(() => this.manifestStatus() === 'pending');

  // computed, so the loading effects run again only when a URL changes
  private readonly settingsUrl = computed(() => this.host.settingsUrl());
  private readonly manifestUrl = computed(() => this.host.manifestUrl());
  private settingsLoad: Promise<void> = Promise.resolve();
  private manifestLoad: Promise<StencilManifest | null> = Promise.resolve(null);

  constructor(private readonly host: ServerSourcesHost) {
    effect((onCleanup) => {
      const url = this.settingsUrl();
      let cancelled = false;
      onCleanup(() => (cancelled = true));
      untracked(() => {
        this.settings.set({});
        this.waitingForSettings.set(!!url);
      });
      this.settingsLoad = url ? this.loadSettings(url, () => cancelled) : Promise.resolve();
    });

    effect((onCleanup) => {
      const url = this.manifestUrl();
      let cancelled = false;
      onCleanup(() => (cancelled = true));
      untracked(() => {
        this.stencils.set(NO_STENCILS);
        this.stickerImages.set(NO_STICKER_IMAGES);
        this.manifestStatus.set(url ? 'pending' : 'none');
      });
      this.manifestLoad = url ? this.loadManifest(url, () => cancelled) : Promise.resolve(null);
    });
  }

  /** Resolves when the settings are loaded or have failed. */
  settingsLoaded(): Promise<void> {
    return this.settingsLoad;
  }

  /** The image stickers; waits for stencils.json while it loads. */
  async stickerImagesWhenLoaded(): Promise<readonly StickerImage[]> {
    if (!this.manifestPending()) {
      return this.stickerImages();
    }
    return (await this.manifestLoad)?.stickers ?? NO_STICKER_IMAGES;
  }

  private async loadSettings(url: string, cancelled: () => boolean): Promise<void> {
    try {
      const { settings, problems } = checkSettings(await loadSettings(url));
      if (cancelled()) {
        return;
      }
      this.settings.set(settings);
      if (problems.length) {
        this.reportSettings('SETTINGS_INVALID', problems);
      }
    } catch (cause) {
      if (!cancelled()) {
        this.reportSettings('SETTINGS_FAILED', cause);
      }
    } finally {
      if (!cancelled()) {
        this.waitingForSettings.set(false);
      }
    }
  }

  private async loadManifest(
    url: string,
    cancelled: () => boolean,
  ): Promise<StencilManifest | null> {
    try {
      const manifest = await loadStencilManifest(url);
      if (!cancelled()) {
        this.stencils.set(manifest.stencils);
        this.stickerImages.set(manifest.stickers);
        this.manifestStatus.set('ready');
      }
      return manifest;
    } catch (cause) {
      if (!cancelled()) {
        this.manifestStatus.set('failed');
        this.host.reportError({ key: 'STENCIL_MANIFEST_FAILED', cause });
      }
      return null;
    }
  }

  /** Silent by default; with settingsFallback = false every settings problem is reported (to check a file). */
  private reportSettings(key: 'SETTINGS_INVALID' | 'SETTINGS_FAILED', cause: unknown): void {
    if (untracked(() => this.host.settingsFallback())) {
      return;
    }
    console.warn(`FaceFrame ${key}: the app's or the built-in value is used instead`, cause);
    this.host.reportError({ key, cause });
  }
}
