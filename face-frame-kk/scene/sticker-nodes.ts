import Konva from './konva';
import { KonvaImage, KonvaText } from './konva';
import { Sticker } from '../stickers/sticker.model';
import { middleOffsetY } from '../layout/text-metrics';

// Stickers as Konva nodes, on a frame of `size` px. An image sticker whose image has not arrived is left out.

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
/** emoji and image are drawn slightly smaller than their box, so they do not touch the selection frame */
const GLYPH_RATIO = 0.85;

export function stickerNode(
  s: Sticker,
  size: number,
  images: ReadonlyMap<string, HTMLImageElement>,
): Konva.Shape | null {
  const box = s.size * size * GLYPH_RATIO;
  const place = { x: s.x * size, y: s.y * size, rotation: s.rotation, listening: false };
  if (s.image === undefined) {
    const fontSize = Math.round(box);
    const node = new KonvaText({
      ...place,
      text: s.emoji,
      fontFamily: EMOJI_FONT,
      fontSize,
      lineHeight: 1,
    });
    node.offset({ x: node.width() / 2, y: middleOffsetY(`${fontSize}px ${EMOJI_FONT}`, fontSize) });
    return node;
  }
  const image = images.get(s.image);
  if (!image?.naturalWidth || !image.naturalHeight) {
    return null;
  }
  // centered and scaled to fit (the server only accepts square images; this keeps others intact)
  const scale = Math.min(box / image.naturalWidth, box / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  return new KonvaImage({
    ...place,
    image,
    width,
    height,
    offsetX: width / 2,
    offsetY: height / 2,
  });
}
