// Loads the images of image stencils and image stickers, with a timeout.

const LOAD_TIMEOUT_MS = 10000;
const cache = new Map<string, Promise<HTMLImageElement>>();

/**
 * Cached per URL. Only for checked URLs: stencil images that passed isAllowedStencilImage(), or sticker images from
 * the same-origin stencils.json.
 */
export function loadStencilImage(url: string): Promise<HTMLImageElement> {
  let pending = cache.get(url);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      const timer = setTimeout(
        () => fail(new Error(`Stencil image timed out: ${url}`)),
        LOAD_TIMEOUT_MS,
      );
      const fail = (error: Error): void => {
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        img.src = '';
        cache.delete(url);
        reject(error);
      };
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => fail(new Error(`Stencil image could not be loaded: ${url}`));
      img.src = url;
    });
    cache.set(url, pending);
  }
  return pending;
}
