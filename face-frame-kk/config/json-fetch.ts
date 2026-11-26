// Downloads a small JSON file from the app's own server (stencils.json, face-frame-settings.json). The timeout
// covers the whole download, not only the headers, and the size is limited, so a stalled or huge response cannot
// keep the editor waiting or fill the memory.

/** both files are a few KB; this leaves plenty of room */
const MAX_JSON_BYTES = 256 * 1024;

export async function fetchJson(href: string, timeoutMs: number, what: string): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    // no-cache: the browser revalidates, so a reload after a deployment gets the new file
    const response = await fetch(href, {
      credentials: 'same-origin',
      cache: 'no-cache',
      redirect: 'error',
      signal: abort.signal,
    });
    if (!response.ok) {
      throw new Error(`${what}: HTTP ${response.status}`);
    }
    if (Number(response.headers.get('content-length') ?? 0) > MAX_JSON_BYTES) {
      throw new Error(`${what}: larger than ${MAX_JSON_BYTES} bytes`);
    }
    const text = await response.text();
    if (text.length > MAX_JSON_BYTES) {
      throw new Error(`${what}: larger than ${MAX_JSON_BYTES} bytes`);
    }
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
  }
}
