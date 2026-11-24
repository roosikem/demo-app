import { InjectionToken, Provider } from '@angular/core';
import {
  BADGE_LINE_MAX_LENGTH,
  CustomFrameState,
  DEFAULT_CUSTOM_STATE,
  TEXT_MAX_LENGTH,
  clamp,
} from '../rendering/custom-frame';
import { DEFAULT_LABELS, FrameLabels } from './frame-labels';
import { BadgeIcon, ExportFormat, Stencil } from '../models/frame.model';
import { COLOR_NAMES } from '../stencils/colors';
import { FONTS, PALETTES, Palette, STENCILS, SWATCHES, TEXT_SWATCHES } from '../stencils/stencils';
import { STENCIL_LIBRARY } from '../stencils/stencil-library';
import { deepFreeze } from '../models/freeze';
import { normalizeImageHost, sanitizeStencils } from './stencil-validation';

// Merge order: DEFAULT_FACE_FRAME_OPTIONS < provideFaceFrame() < [options] input

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
  /** Translates stencil names, categories and palette names, e.g. key => translate.instant(key). */
  readonly translate: (text: string) => string;
  /** Also translate the texts drawn on the stencils. */
  readonly translateStencilTexts: boolean;
  /** Accessible names of the swatch colours (hex -> name), passed through translate. */
  readonly colorNames: Readonly<Record<string, string>>;
  /** https hosts for stencil images besides the own origin */
  readonly imageHosts: readonly string[];
  /**
   * URL of stencils.json (written by scripts/face-frame-stencils.mjs), e.g.
   * 'assets/face-frame/stencils/stencils.json'. Its image stencils are added after `stencils`.
   * Same origin only; null = no manifest.
   */
  readonly stencilManifest: string | null;
}

export type FaceFrameOptionsInput = Partial<
  Omit<FaceFrameOptions, 'zoom' | 'export' | 'download' | 'features'>
> & {
  readonly zoom?: Partial<FaceFrameOptions['zoom']>;
  readonly export?: Partial<FaceFrameOptions['export']>;
  readonly download?: Partial<FaceFrameOptions['download']>;
  readonly features?: Partial<FaceFrameFeatures>;
};

export const MIN_EXPORT_SIZE = 32;
export const MAX_EXPORT_SIZE = 4096;
const DEFAULT_FILE_NAME = 'profile-photo';
const SAFE_FILE_NAME = /^[\w.-]{1,64}$/;

export const DEFAULT_FACE_FRAME_OPTIONS: FaceFrameOptions = deepFreeze({
  stencils: sanitizeStencils([...STENCILS, ...STENCIL_LIBRARY], { imageHosts: [] }),
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
  },
  translate: (text) => text,
  translateStencilTexts: false,
  colorNames: COLOR_NAMES,
  imageHosts: [],
  stencilManifest: null,
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
    defaultCustom: { ...merged.defaultCustom },
    imageHosts,
    stencilManifest: typeof merged.stencilManifest === 'string' ? merged.stencilManifest : null,
    stencils: sanitizeStencils(merged.stencils, { imageHosts }),
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
    | 'STENCIL_MANIFEST_FAILED';
  readonly cause: unknown;
}

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** Drops undefined fields, so { size: undefined } keeps the default instead of overwriting it. */
function defined<T extends object>(value: T | undefined): Defined<T> {
  const result: Record<string, unknown> = {};
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
