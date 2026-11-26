import Konva from './konva';
import { FrameScene, SceneContent } from './frame-scene';

// Small pictures of a frame (stencil gallery, chat preview). One off-screen stage draws them all, so a long gallery
// does not create a canvas per stencil.

export class ThumbnailRenderer {
  private stage: Konva.Stage | null = null;
  private scene: FrameScene | null = null;
  private size = 0;
  private destroyed = false;

  /** PNG data URL of the frame at `size` px; '' once destroyed (a late batch after the editor closed). */
  render(content: SceneContent, size: number): string {
    if (this.destroyed) {
      return '';
    }
    if (!this.stage || !this.scene || size !== this.size) {
      this.stage?.destroy();
      this.size = size;
      this.stage = new Konva.Stage({
        container: document.createElement('div'),
        width: size,
        height: size,
      });
      this.scene = new FrameScene(size);
      this.stage.add(this.scene.layer);
    }
    this.scene.render(content);
    return this.stage.toDataURL({ pixelRatio: 1 });
  }

  destroy(): void {
    this.destroyed = true;
    this.stage?.destroy();
    this.stage = null;
    this.scene = null;
  }
}
