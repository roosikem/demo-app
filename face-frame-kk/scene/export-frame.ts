import Konva from './konva';
import { DEFAULT_PHOTO, ExportFormat, FrameConfig } from '../models/frame.model';
import { FrameScene, SceneContent } from './frame-scene';

// The framed photo (or the frame alone, as a stencil) as a file: drawn on its own stage at the export size,
// with the same scene as the preview.

/** JPEG has no transparency: the corners get this color. */
export const JPEG_BACKGROUND = '#ffffff';
const JPEG_QUALITY = 0.92;

/** Premade image stencils are exactly this size (checked by the stencil script and the backend). */
export const STENCIL_SIZE = 1024;

export function exportFrame(
  content: SceneContent,
  size: number,
  format: ExportFormat,
): Promise<Blob> {
  return toBlob(content, size, format, format === 'image/jpeg' ? JPEG_BACKGROUND : undefined);
}

/**
 * The frame without the photo, as a PNG with a transparent middle: usable as a premade image stencil
 * (stencil zip). Stickers are left out, like on every premade stencil.
 */
export function exportStencil(
  config: FrameConfig,
  revision: number,
  size = STENCIL_SIZE,
): Promise<Blob> {
  const content: SceneContent = {
    config,
    revision,
    photo: null,
    transform: DEFAULT_PHOTO,
    stencilImage: null,
    frameOnly: true,
  };
  return toBlob(content, size, 'image/png');
}

async function toBlob(
  content: SceneContent,
  size: number,
  format: ExportFormat,
  background?: string,
): Promise<Blob> {
  const stage = new Konva.Stage({
    container: document.createElement('div'),
    width: size,
    height: size,
  });
  try {
    const scene = new FrameScene(size);
    stage.add(scene.layer);
    scene.render(content, background);
    // pixelRatio 1: the file has exactly `size` px, whatever the screen density
    const blob = await stage.toBlob({ mimeType: format, quality: JPEG_QUALITY, pixelRatio: 1 });
    if (!(blob instanceof Blob)) {
      throw new Error('Image export failed');
    }
    return blob;
  } finally {
    stage.destroy();
  }
}
