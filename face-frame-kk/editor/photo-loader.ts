// Turns the editor's `source` input (a file or a URL) into an image the preview can draw. Untrusted input: the type,
// the file size and the pixel count are checked before the photo is decoded, a very large photo is scaled down once,
// and a URL may only point to the app itself, an allowed image host, or be a blob: / image data: URL.

const PHOTO_TYPES = /^image\/(png|jpeg|webp)$/;
const DATA_URL = /^data:image\/(png|jpeg|webp)[;,]/i;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
/** about a 6300 x 6300 photo; more would take hundreds of MB once decoded */
const MAX_PIXELS = 40_000_000;
/** longer edge of the working copy; exports are at most 4096 px, so nothing visible is lost */
const WORKING_EDGE = 4096;
const LOAD_TIMEOUT_MS = 15000;

export class PhotoLoader {
  private objectUrls: string[] = [];
  private pending: HTMLImageElement | null = null;

  /** `imageHosts`: hosts besides the app's own origin a photo URL may point to (options.imageHosts). */
  async load(
    source: Blob | string | null,
    imageHosts: readonly string[],
  ): Promise<HTMLImageElement | null> {
    this.release();
    if (!source) {
      return null;
    }
    const img = await this.loaded(this.urlOf(source, imageHosts));
    const pixels = img.naturalWidth * img.naturalHeight;
    if (!pixels || pixels > MAX_PIXELS) {
      throw new Error('photo has no size or too many pixels');
    }
    if (Math.max(img.naturalWidth, img.naturalHeight) > WORKING_EDGE) {
      return this.loaded(await this.scaledDown(img));
    }
    await img.decode();
    return img;
  }

  /** Releases object URLs and stops a load that is still running. */
  release(): void {
    if (this.pending) {
      this.pending.onload = null;
      this.pending.onerror = null;
      this.pending.src = '';
      this.pending = null;
    }
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls = [];
  }

  private urlOf(source: Blob | string, imageHosts: readonly string[]): string {
    if (typeof source !== 'string') {
      if (!PHOTO_TYPES.test(source.type) || source.size > MAX_PHOTO_BYTES) {
        throw new Error('photo must be a PNG, JPEG or WebP file of at most 20 MB');
      }
      return this.objectUrl(source);
    }
    if (DATA_URL.test(source) || source.startsWith('blob:')) {
      return source;
    }
    const parsed = new URL(source, document.baseURI);
    const sameOrigin = parsed.origin === location.origin;
    const allowedHost = parsed.protocol === 'https:' && imageHosts.includes(parsed.host);
    if (!sameOrigin && !allowedHost) {
      throw new Error('photo URL must be on this site or an allowed image host');
    }
    return parsed.href;
  }

  /** Waits for the image to load (not to decode), so its size can be checked first. */
  private loaded(url: string): Promise<HTMLImageElement> {
    const img = new Image();
    // a photo from another allowed host needs CORS, otherwise the export fails on a tainted canvas
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    this.pending = img;
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const timer = setTimeout(
        () => done(new Error('photo did not load in time')),
        LOAD_TIMEOUT_MS,
      );
      const done = (error: Error | null): void => {
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        if (this.pending === img) {
          this.pending = null;
        }
        if (error) {
          img.src = '';
          reject(error);
        } else {
          resolve(img);
        }
      };
      img.onload = () => done(null);
      img.onerror = () => done(new Error('photo could not be loaded'));
      img.src = url;
    });
  }

  private async scaledDown(img: HTMLImageElement): Promise<string> {
    const scale = WORKING_EDGE / Math.max(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      throw new Error('photo could not be scaled down');
    }
    return this.objectUrl(blob);
  }

  private objectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.objectUrls.push(url);
    return url;
  }
}
