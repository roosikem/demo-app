import { KonvaText, TextPath } from './konva';
import { FrameGeometry, konvaRotation } from '../layout/frame-geometry';
import { DEFAULT_FONT, FONT_OF_BAND, fitText, middleOffsetY } from '../layout/text-metrics';
import { ArcText, Decoration } from '../models/frame.model';

// Texts and symbols on the ring as Konva nodes. A text runs along an arc in the middle of the ring
// (TextPath), at the size layout/text-metrics.ts fitted; at the bottom it runs counter-clockwise so it reads
// upright.

/** the arc runs a bit past the text, so rounding never drops the last letter */
const PATH_SLACK = 1.05;

export function ringTextNode(g: FrameGeometry, t: ArcText): TextPath | null {
  const fitted = fitText(g, t);
  if (!fitted) {
    return null;
  }
  const half = fitted.span / 2;
  // TextPath puts the letter spacing after each letter; centered cells put half of it before
  const lead = ((fitted.spacing / 2 / fitted.radius) * 180) / Math.PI;
  const clockwise = t.direction === 'cw';
  const from = clockwise ? t.center - half + lead : t.center + half - lead;
  const to = clockwise ? t.center + half * PATH_SLACK : t.center - half * PATH_SLACK;
  return new TextPath({
    data: arcPath(g.center, fitted.radius, from, to, clockwise),
    text: fitted.text,
    fill: t.color,
    fontFamily: fitted.fontFamily,
    fontStyle: String(fitted.fontWeight),
    fontSize: fitted.fontSize,
    letterSpacing: fitted.spacing,
    align: 'left',
    textBaseline: 'middle',
    listening: false,
  });
}

export function decorationNode(g: FrameGeometry, d: Decoration): KonvaText {
  const band = g.outer - g.inner;
  const radius = g.outer - band / 2;
  const a = (konvaRotation(d.angle) * Math.PI) / 180;
  const fontSize = band * FONT_OF_BAND;
  const node = new KonvaText({
    text: d.symbol,
    fill: d.color,
    fontFamily: DEFAULT_FONT,
    fontStyle: '700',
    fontSize,
    x: g.center + Math.cos(a) * radius,
    y: g.center + Math.sin(a) * radius,
    rotation: d.angle,
    lineHeight: 1,
    listening: false,
  });
  node.offset({
    x: node.width() / 2,
    y: middleOffsetY(`700 ${fontSize}px ${DEFAULT_FONT}`, fontSize),
  });
  return node;
}

/** SVG arc around (c, c) from frame angle `from` to `to` (degrees, 0 = top). */
function arcPath(c: number, r: number, from: number, to: number, clockwise: boolean): string {
  const point = (deg: number): string => {
    const a = (deg * Math.PI) / 180;
    return `${c + r * Math.sin(a)} ${c - r * Math.cos(a)}`;
  };
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${point(from)} A ${r} ${r} 0 ${large} ${clockwise ? 1 : 0} ${point(to)}`;
}
