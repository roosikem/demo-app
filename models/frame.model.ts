import { deepFreeze } from './freeze';

// Sizes are fractions of the outer radius, angles are degrees (0 = top, clockwise).

export type RingFill =
  | { readonly type: 'solid'; readonly color: string }
  | { readonly type: 'gradient'; readonly colors: readonly string[] }
  | { readonly type: 'segments'; readonly colors: readonly string[] };

export interface RingLayer {
  readonly fill: RingFill;
  /** 0.05 .. 0.35 */
  readonly width: number;
  /** Partial ring, omitted = full circle. */
  readonly arc?: { readonly start: number; readonly end: number };
  readonly innerLine?: { readonly color: string; readonly width: number };
}

/** cw: for text at the top / sides, ccw: for text at the bottom (stays upright). */
export interface ArcText {
  readonly text: string;
  readonly color: string;
  readonly center: number;
  readonly direction: 'cw' | 'ccw';
  /** Max. angle in degrees, the font shrinks to fit. */
  readonly maxSpan?: number;
  readonly fontFamily?: string;
  readonly fontWeight?: number;
  /** Fraction of the font size. */
  readonly letterSpacing?: number;
}

export type BadgeIcon = 'none' | 'star' | 'check' | 'heart' | 'cloud';

export interface BubbleBadge {
  readonly shape: 'bubble';
  readonly color: string;
  readonly textColor: string;
  readonly lines: readonly string[];
  readonly angle: number;
  readonly icon?: BadgeIcon;
  /**
   * floating: separate circle with a gap; joined: touches the ring with rounded joins; flush: touches the outer
   * edge without joins. Default: joined when the badge has the ring color, otherwise floating.
   */
  readonly style?: BubbleStyle;
  /** Size factor, 1 = default size. */
  readonly scale?: number;
  /**
   * Center of a badge the user has moved, 0 .. 1 of the frame size; drawn there instead of on the ring at `angle`.
   * Away from the ring edge a joined or flush badge is drawn floating.
   */
  readonly at?: BadgePosition;
}

export type BubbleStyle = 'floating' | 'joined' | 'flush';

/** Center of a moved badge, 0 .. 1 of the frame size from the left / top edge. */
export interface BadgePosition {
  readonly x: number;
  readonly y: number;
}

export interface DiagonalBadge {
  readonly shape: 'diagonal';
  readonly color: string;
  readonly textColor: string;
  readonly title: string;
  readonly titleColors?: readonly string[];
  readonly lines: readonly string[];
  /** Width factor of the band, 1 = default width. */
  readonly scale?: number;
}

export type Badge = BubbleBadge | DiagonalBadge;

export interface Decoration {
  readonly symbol: string;
  readonly angle: number;
  readonly color: string;
}

export interface FrameConfig {
  readonly ring: RingLayer | null;
  readonly texts: readonly ArcText[];
  readonly badge?: Badge;
  readonly decorations?: readonly Decoration[];
  /** 'outer' fills the whole circle, used with partial rings and image stencils. */
  readonly photoClip: 'inner' | 'outer';
  readonly photoBackground: string;
  /**
   * URL of a square stencil image with a transparent center (PNG only), drawn over the photo.
   * Must be same-origin or served with CORS headers, otherwise the framed photo cannot be exported.
   */
  readonly image?: string;
}

export interface PhotoTransform {
  /** 1 = photo covers the circle */
  readonly zoom: number;
  readonly rotation: number;
  /** -0.5 .. 0.5 of the photo circle diameter */
  readonly offsetX: number;
  readonly offsetY: number;
}

export const DEFAULT_PHOTO: PhotoTransform = deepFreeze({
  zoom: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
});

export interface Stencil {
  readonly id: string;
  readonly label: string;
  readonly config: FrameConfig;
  readonly category?: string;
  /** Extra search words. */
  readonly tags?: readonly string[];
}

export type ExportFormat = 'image/png' | 'image/jpeg';
