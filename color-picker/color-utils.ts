export interface Hsv {
  /** 0 .. 360 */
  readonly h: number;
  /** 0 .. 1 */
  readonly s: number;
  /** 0 .. 1 */
  readonly v: number;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** '#abc' / 'abc' / '#AABBCC' -> '#aabbcc', null if invalid */
export function normalizeHex(value: string): string | null {
  const m = HEX.exec(value.trim());
  if (!m) {
    return null;
  }
  const hex = m[1].length === 3 ? Array.from(m[1], c => c + c).join('') : m[1];
  return `#${hex.toLowerCase()}`;
}

export function hexToHsv(value: string): Hsv {
  const hex = normalizeHex(value) ?? '#000000';
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) {
      h = ((g - b) / d) % 6;
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector];
  const toHex = (value: number): string => {
    const hex = Math.round((value + m) * 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
