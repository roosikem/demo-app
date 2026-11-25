import { ExportFormat } from '../models/frame.model';
import { BADGE_LINE_MAX_LENGTH, TEXT_MAX_LENGTH } from '../rendering/custom-frame';
import {
  DEFAULT_FACE_FRAME_OPTIONS,
  FaceFrameOptionsInput,
  MAX_EXPORT_SIZE,
  MIN_EXPORT_SIZE,
  SAFE_FILE_NAME,
  sanitizeEmojis,
} from './face-frame-options';
import { resolveManifestUrl } from './stencil-manifest';

// face-frame-settings.json, served next to stencils.json from the stencil zip, e.g.
// { "features": { "stickers": true }, "badgeMovement": { "restrictOnText": true }, "download": { "size": 2048 } }
// Every setting is checked on its own: a missing or wrong one keeps the app's (or the built-in) value, the others
// still apply. Stencils, labels, URLs and callbacks are never taken from the server.

/** The settings that could be used, and what was wrong with the others (for options.settingsFallback = false). */
export interface CheckedSettings {
  readonly settings: FaceFrameOptionsInput;
  readonly problems: readonly string[];
}

const FORMATS: readonly ExportFormat[] = ['image/png', 'image/jpeg'];
const JSON_PATH = /\.json$/i;
const ZOOM_LIMIT = 10;
/** a wider minimum would show "expand window" instead of the editor on most screens */
const MAX_MIN_WINDOW_WIDTH = 1600;
/** the editor waits for the settings; a server that does not answer must not keep it hidden */
const LOAD_TIMEOUT_MS = 5000;

const cache = new Map<string, Promise<unknown>>();

/** Checks the settings from the server one by one. */
export function checkSettings(data: unknown): CheckedSettings {
  const problems: string[] = [];
  if (!isObject(data)) {
    return { settings: {}, problems: ['the file is not a JSON object'] };
  }
  const settings: Record<string, unknown> = {};
  const take = (key: string, value: unknown, problem: string | null): void => {
    if (problem === null) {
      settings[key] = value;
    } else {
      problems.push(`${key}: ${problem}`);
    }
  };
  // a group (export, download, ...): its valid parts apply even when another part is wrong
  const takeParts = (key: string, parts: object | undefined, problem: string | null): void => {
    if (parts && Object.keys(parts).length) {
      settings[key] = parts;
    }
    if (problem !== null) {
      problems.push(`${key}: ${problem}`);
    }
  };
  for (const key of Object.keys(data)) {
    const value = data[key];
    switch (key) {
      case 'features':
        takeParts(key, ...flags(value, DEFAULT_FACE_FRAME_OPTIONS.features, key, problems));
        break;
      case 'badgeMovement':
        takeParts(key, ...flags(value, DEFAULT_FACE_FRAME_OPTIONS.badgeMovement, key, problems));
        break;
      case 'stickerEmojis':
        take(key, value, emojiList(value));
        break;
      case 'export':
        takeParts(key, ...exportSettings(value));
        break;
      case 'download':
        takeParts(key, ...downloadSettings(value));
        break;
      case 'zoom':
        takeParts(key, ...zoomRange(value));
        break;
      case 'previewSize':
        take(key, value, wholeNumber(value, 160, 800));
        break;
      case 'minWindowWidth':
        take(key, value, wholeNumber(value, 0, MAX_MIN_WINDOW_WIDTH));
        break;
      case 'minContrast':
        take(key, value, numberIn(value, 1, 21));
        break;
      case 'textMaxLength':
        take(key, value, wholeNumber(value, 1, TEXT_MAX_LENGTH * 2));
        break;
      case 'badgeLineMaxLength':
        take(key, value, wholeNumber(value, 1, BADGE_LINE_MAX_LENGTH * 2));
        break;
      case 'translateStencilTexts':
      case 'settingsFallback':
        take(key, value, typeof value === 'boolean' ? null : 'must be true or false');
        break;
      default:
        problems.push(`${key}: unknown setting`);
    }
  }
  return { settings: settings as FaceFrameOptionsInput, problems };
}

/**
 * Same-origin .json only, no redirects, at most 5 seconds; loaded once per URL and page, also when it fails (a zip
 * without settings would otherwise be asked again, with a 404, for every editor).
 */
export function loadSettings(url: string): Promise<unknown> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetchSettings(url);
    cache.set(url, pending);
  }
  return pending;
}

async function fetchSettings(url: string): Promise<unknown> {
  const parsed = resolveManifestUrl(url);
  if (parsed.origin !== location.origin || !JSON_PATH.test(parsed.pathname)) {
    throw new Error(`settings must be a same-origin .json file: ${url}`);
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LOAD_TIMEOUT_MS);
  let response: Response;
  try {
    // no-cache: the browser revalidates, so changed settings apply after a reload
    response = await fetch(parsed.href, {
      credentials: 'same-origin',
      cache: 'no-cache',
      redirect: 'error',
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`settings ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

/** Known switches that are true or false; the others are left out and reported. */
function flags<T extends object>(
  value: unknown,
  known: T,
  name: string,
  problems: string[],
): [Partial<T>, string | null] {
  if (!isObject(value)) {
    return [{}, 'must be an object'];
  }
  const result: Record<string, boolean> = {};
  for (const key of Object.keys(value)) {
    if (!Object.prototype.hasOwnProperty.call(known, key)) {
      problems.push(`${name}.${key}: unknown setting`);
    } else if (typeof value[key] === 'boolean') {
      result[key] = value[key] as boolean;
    } else {
      problems.push(`${name}.${key}: must be true or false`);
    }
  }
  return [result as Partial<T>, null];
}

function exportSettings(value: unknown): [FaceFrameOptionsInput['export'], string | null] {
  if (!isObject(value)) {
    return [{}, 'must be an object'];
  }
  const problems: string[] = [];
  const result: { size?: number; format?: ExportFormat } = { ...imageSize(value, problems) };
  if ('format' in value) {
    if (FORMATS.includes(value['format'] as ExportFormat)) {
      result.format = value['format'] as ExportFormat;
    } else {
      problems.push(`format must be one of ${FORMATS.join(', ')}`);
    }
  }
  return [result, problems.length ? problems.join('; ') : null];
}

function downloadSettings(value: unknown): [FaceFrameOptionsInput['download'], string | null] {
  if (!isObject(value)) {
    return [{}, 'must be an object'];
  }
  const problems: string[] = [];
  const result: { size?: number; formats?: ExportFormat[]; fileName?: string } = {
    ...imageSize(value, problems),
  };
  if ('formats' in value) {
    const formats = value['formats'];
    if (
      Array.isArray(formats) &&
      formats.length > 0 &&
      formats.every((f, i) => FORMATS.includes(f as ExportFormat) && formats.indexOf(f) === i)
    ) {
      result.formats = formats as ExportFormat[];
    } else {
      problems.push(`formats must be a non-empty list of ${FORMATS.join(', ')}, each once`);
    }
  }
  if ('fileName' in value) {
    if (typeof value['fileName'] === 'string' && SAFE_FILE_NAME.test(value['fileName'])) {
      result.fileName = value['fileName'];
    } else {
      problems.push('fileName must be 1 to 64 of A-Z, a-z, 0-9, _, . and -');
    }
  }
  return [result, problems.length ? problems.join('; ') : null];
}

/** The size of an exported image (export and download), 32 .. 4096 px. */
function imageSize(value: Record<string, unknown>, problems: string[]): { size?: number } {
  if (!('size' in value)) {
    return {};
  }
  const problem = wholeNumber(value['size'], MIN_EXPORT_SIZE, MAX_EXPORT_SIZE);
  if (problem) {
    problems.push(`size ${problem}`);
    return {};
  }
  return { size: value['size'] as number };
}

/** Both or none: a single bound could cross the app's other bound. */
function zoomRange(value: unknown): [FaceFrameOptionsInput['zoom'], string | null] {
  if (!isObject(value)) {
    return [{}, 'must be an object'];
  }
  const { min, max } = value;
  const valid =
    typeof min === 'number' &&
    typeof max === 'number' &&
    min >= 1 &&
    max <= ZOOM_LIMIT &&
    min < max;
  return valid ? [{ min, max }, null] : [{}, `needs min and max, 1 <= min < max <= ${ZOOM_LIMIT}`];
}

function wholeNumber(value: unknown, min: number, max: number): string | null {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? null
    : `must be a whole number from ${min} to ${max}`;
}

function numberIn(value: unknown, min: number, max: number): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? null
    : `must be a number from ${min} to ${max}`;
}

/** As the editor keeps it (sanitizeEmojis): each emoji once, 1 to 16 characters, at most 32; [] = images only. */
function emojiList(value: unknown): string | null {
  return Array.isArray(value) && sanitizeEmojis(value).length === value.length
    ? null
    : 'must be a list of at most 32 different emojis of 1 to 16 characters';
}

// plain objects only, so no values can come from a prototype
function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
