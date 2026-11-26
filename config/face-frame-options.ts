import { InjectionToken, Provider } from '@angular/core';
import {
  BADGE_LINE_MAX_LENGTH,
  CustomFrameState,
  DEFAULT_CUSTOM_STATE,
  TEXT_MAX_LENGTH,
  normalizeBadgeSize,
} from '../rendering/custom-frame';
import { clamp } from '../models/numbers';
import { DEFAULT_LABELS, FrameLabels } from './frame-labels';
import { BadgeIcon, ExportFormat, Stencil } from '../models/frame.model';
import { COLOR_NAMES } from '../stencils/colors';
import { FONTS, PALETTES, Palette, SWATCHES, TEXT_SWATCHES } from '../stencils/stencils';
import { deepFreeze } from '../models/freeze';
import { DEFAULT_STICKER_EMOJIS } from '../stickers/sticker.model';
import { normalizeImageHost, sanitizeStencils } from './stencil-validation';

// Merge order: DEFAULT_FACE_FRAME_OPTIONS < provideFaceFrame() < [options] input < server settings (settingsUrl)

export interface FaceFrameFeatures {
  readonly customTab: boolean;
  readonly stencilsTab: boolean;
  readonly badge: boolean;
  readonly photoControls: boolean;
  readonly chatPreview: boolean;
  readonly contrastWarning: boolean;
  readonly download: boolean;
  readonly showInPhoto: boolean;
  readonly stencilSearch: boolean;
  readonly stencilCategories: boolean;
  readonly stencilDropdown: boolean;
  /** Stickers placed freely on the photo; off by default. */
  readonly stickers: boolean;
  /** Round badges can be moved on the frame (drag, or arrow keys once selected); on by default. */
  readonly badgeMove: boolean;
  /** The texts of the customized circle can be moved along the ring, never onto each other; on by default. */
  readonly textMove: boolean;
  /** "Download as stencil" on the customized circle tab: the frame without the photo, for the stencil zip; off by default. */
  readonly stencilCreationAllowed: boolean;
}

/** Limits for a moved round badge (features.badgeMove). */
export interface BadgeMovement {
  /** the whole badge stays inside the round frame; default true */
  readonly restrictInsideFrame: boolean;
  /** the badge cannot cover a text or symbol on the ring; default false (left to the user) */
  readonly restrictOnText: boolean;
}

export interface FaceFrameOptions {
  readonly stencils: readonly Stencil[];
  readonly palettes: readonly Palette[];
  readonly swatches: readonly string[];
  readonly textSwatches: readonly string[];
  readonly fonts: readonly string[];
  readonly badgeIcons: readonly BadgeIcon[];
  readonly defaultCustom: CustomFrameState;
  readonly labels: Partial<FrameLabels>;
  /** px, below this the "expand window" message is shown */
  readonly minWindowWidth: number;
  /** px */
  readonly previewSize: number;
  readonly zoom: { readonly min: number; readonly max: number };
  /** Used by exportImage(), showInPhoto and framedChange (= upload). */
  readonly export: { readonly size: number; readonly format: ExportFormat };
  readonly download: {
    readonly size: number;
    readonly formats: readonly ExportFormat[];
    /** without extension */
    readonly fileName: string;
  };
  readonly minContrast: number;
  readonly textMaxLength: number;
  readonly badgeLineMaxLength: number;
  readonly features: FaceFrameFeatures;
  readonly badgeMovement: BadgeMovement;
  /** Translates stencil names, categories and palette names, e.g. key => translate.instant(key). */
  readonly translate: (text: string) => string;
  /** Also translate the texts drawn on the stencils. */
  readonly translateStencilTexts: boolean;
  /** Accessible names of the swatch colors (hex -> name), passed through translate. */
  readonly colorNames: Readonly<Record<string, string>>;
  /** https hosts for stencil images besides the own origin */
  readonly imageHosts: readonly string[];
  /**
   * URL of stencils.json (written by scripts/face-frame-stencils.mjs), e.g.
   * 'assets/face-frame/stencils/stencils.json'. Its image stencils are added after `stencils`.
   * Same origin only; null = no manifest.
   */
  readonly stencilManifest: string | null;
  /**
   * URL of face-frame-settings.json (editor settings from the server, e.g.
   * '/api/face-frame/stencils/face-frame-settings.json'). They win over the app's options; a missing or wrong
   * setting keeps the app's value. Same origin only; null = no server settings.
   */
  readonly settingsUrl: string | null;
  /**
   * true: a server setting that cannot be used, or a settings file that cannot be loaded, silently keeps the
   * app's / built-in value. false (to check a settings file): each one is reported through frameError
   * (SETTINGS_INVALID / SETTINGS_FAILED) and the console; the value used is the same.
   */
  readonly settingsFallback: boolean;
  /** Emojis offered as stickers (features.stickers); saved stickers with other emojis are dropped. */
  readonly stickerEmojis: readonly string[];
}

export type FaceFrameOptionsInput = Partial<
  Omit<FaceFrameOptions, 'zoom' | 'export' | 'download' | 'features' | 'badgeMovement'>
> & {
  readonly zoom?: Partial<FaceFrameOptions['zoom']>;
  readonly export?: Partial<FaceFrameOptions['export']>;
  readonly download?: Partial<FaceFrameOptions['download']>;
  readonly features?: Partial<FaceFrameFeatures>;
  readonly badgeMovement?: Partial<BadgeMovement>;
};

export const MIN_EXPORT_SIZE = 32;
export const MAX_EXPORT_SIZE = 4096;
const DEFAULT_FILE_NAME = 'profile-photo';
export const SAFE_FILE_NAME = /^[\w.-]{1,64}$/;

/** Download name of "Download as stencil": also a valid stencil file name (letters, digits, - and _). */
export function stencilFileName(fileName: string): string {
  const base = fileName
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 52);
  return `${base || 'frame'}-stencil.png`;
}

export const DEFAULT_FACE_FRAME_OPTIONS: FaceFrameOptions = deepFreeze({
  // premade stencils come from the server (stencilManifest); an app can add its own here
  stencils: [],
  palettes: PALETTES,
  swatches: SWATCHES,
  textSwatches: TEXT_SWATCHES,
  fonts: FONTS,
  badgeIcons: ['none', 'check', 'star', 'heart', 'cloud'],
  defaultCustom: DEFAULT_CUSTOM_STATE,
  labels: DEFAULT_LABELS,
  minWindowWidth: 1024,
  previewSize: 320,
  zoom: { min: 1, max: 3 },
  export: { size: 300, format: 'image/png' },
  download: { size: 1024, formats: ['image/png', 'image/jpeg'], fileName: DEFAULT_FILE_NAME },
  minContrast: 3,
  textMaxLength: TEXT_MAX_LENGTH,
  badgeLineMaxLength: BADGE_LINE_MAX_LENGTH,
  features: {
    customTab: true,
    stencilsTab: true,
    badge: true,
    photoControls: true,
    chatPreview: true,
    contrastWarning: true,
    download: true,
    showInPhoto: true,
    stencilSearch: true,
    stencilCategories: true,
    stencilDropdown: true,
    stickers: false,
    badgeMove: true,
    textMove: true,
    stencilCreationAllowed: false,
  },
  badgeMovement: { restrictInsideFrame: true, restrictOnText: false },
  translate: (text) => text,
  translateStencilTexts: false,
  colorNames: COLOR_NAMES,
  imageHosts: [],
  stencilManifest: null,
  settingsUrl: null,
  settingsFallback: true,
  stickerEmojis: DEFAULT_STICKER_EMOJIS,
});

export const FACE_FRAME_OPTIONS = new InjectionToken<FaceFrameOptionsInput>('FACE_FRAME_OPTIONS');

export function provideFaceFrame(options: FaceFrameOptionsInput): Provider {
  return { provide: FACE_FRAME_OPTIONS, useValue: options };
}

export function mergeFaceFrameOptions(
  base: FaceFrameOptions,
  ...inputs: (FaceFrameOptionsInput | null | undefined)[]
): FaceFrameOptions {
  const merged = inputs.reduce<FaceFrameOptions>((acc, input): FaceFrameOptions => {
    if (!input) {
      return acc;
    }
    const {
      zoom,
      export: exportOptions,
      download,
      features,
      badgeMovement,
      labels,
      colorNames,
      ...rest
    } = defined(input);
    return {
      ...acc,
      ...(rest as Partial<FaceFrameOptions>),
      zoom: { ...acc.zoom, ...defined(zoom) },
      export: { ...acc.export, ...defined(exportOptions) },
      download: { ...acc.download, ...defined(download) },
      features: { ...acc.features, ...defined(features) },
      badgeMovement: { ...acc.badgeMovement, ...defined(badgeMovement) },
      labels: { ...acc.labels, ...defined(labels) },
      colorNames: { ...acc.colorNames, ...defined(colorNames) } as FaceFrameOptions['colorNames'],
    };
  }, base);
  const imageHosts = (Array.isArray(merged.imageHosts) ? merged.imageHosts : [])
    .map(normalizeImageHost)
    .filter((h): h is string => h !== null);
  // copies, so arrays passed in by the app are not frozen
  return deepFreeze({
    ...merged,
    palettes: merged.palettes.map((p) => ({ ...p, colors: [...p.colors] })),
    swatches: [...merged.swatches],
    textSwatches: [...merged.textSwatches],
    fonts: [...merged.fonts],
    badgeIcons: [...merged.badgeIcons],
    defaultCustom: mergeDefaultCustom(merged.defaultCustom),
    imageHosts,
    stencilManifest: typeof merged.stencilManifest === 'string' ? merged.stencilManifest : null,
    settingsUrl: typeof merged.settingsUrl === 'string' ? merged.settingsUrl : null,
    settingsFallback: merged.settingsFallback !== false,
    stencils: sanitizeStencils(merged.stencils, { imageHosts }),
    stickerEmojis: sanitizeEmojis(merged.stickerEmojis),
    badgeMovement: {
      restrictInsideFrame: merged.badgeMovement.restrictInsideFrame !== false,
      restrictOnText: merged.badgeMovement.restrictOnText === true,
    },
    export: { ...merged.export, size: clamp(merged.export.size, MIN_EXPORT_SIZE, MAX_EXPORT_SIZE) },
    download: {
      ...merged.download,
      formats: [...merged.download.formats],
      size: clamp(merged.download.size, MIN_EXPORT_SIZE, MAX_EXPORT_SIZE),
      fileName: SAFE_FILE_NAME.test(merged.download.fileName)
        ? merged.download.fileName
        : DEFAULT_FILE_NAME,
    },
  });
}

export interface FaceFrameError {
  readonly key:
    | 'LOAD_FAILED'
    | 'EXPORT_FAILED'
    | 'DOWNLOAD_FAILED'
    | 'STENCIL_LOAD_FAILED'
    | 'STENCIL_MANIFEST_FAILED'
    | 'SETTINGS_FAILED'
    | 'SETTINGS_INVALID';
  readonly cause: unknown;
}

/** An app's defaultCustom may predate newer fields (e.g. badgeSize): those keep the built-in defaults. */
function mergeDefaultCustom(custom: CustomFrameState): CustomFrameState {
  const merged = { ...DEFAULT_CUSTOM_STATE, ...defined(custom) };
  return { ...merged, badgeSize: normalizeBadgeSize(merged.badgeSize) };
}

const MAX_STICKER_EMOJIS = 32;
const MAX_EMOJI_LENGTH = 16;

export function sanitizeEmojis(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_STICKER_EMOJIS];
  }
  const emojis = value
    .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    .map((e) => e.trim())
    .filter((e) => e.length <= MAX_EMOJI_LENGTH);
  return [...new Set(emojis)].slice(0, MAX_STICKER_EMOJIS);
}

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** Drops undefined fields, so { size: undefined } keeps the default instead of overwriting it. */
function defined<T extends object>(value: T | undefined): Defined<T> {
  // no prototype: a key like "__proto__" stays a plain key
  const result = Object.create(null) as Record<string, unknown>;
  if (value) {
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }
  }
  return result as Defined<T>;
}
