import Konva from './konva';
import { Arc, Circle, KonvaImage, Rect } from './konva';
import { FrameConfig, PhotoTransform, RingLayer } from '../models/frame.model';
import { Sticker } from '../stickers/sticker.model';
import { FrameGeometry, frameGeometry, konvaRotation } from '../layout/frame-geometry';
import { badgeNode } from './badge-nodes';
import { decorationNode, ringTextNode } from './ring-texts';
import { stickerNode } from './sticker-nodes';

// One frame as Konva nodes: photo, ring, stencil image, symbols, badge, texts, stickers. The preview and the export
// both draw with it, so the downloaded image is what the user saw. A part is built again only when its own input
// changed, so a drag (many renders per second) rebuilds only what moves.

export interface SceneContent {
  readonly config: FrameConfig;
  readonly photo: HTMLImageElement | null;
  readonly transform: PhotoTransform;
  readonly stencilImage: HTMLImageElement | null;
  readonly stickers?: readonly Sticker[];
  /** loaded images of image stickers, by id */
  readonly stickerImages?: ReadonlyMap<string, HTMLImageElement>;
  /** changes when the texts must be measured again (a web font has loaded) */
  readonly revision?: number;
  /** only the frame: no photo and no photo background (a premade image stencil) */
  readonly frameOnly?: boolean;
}

const NO_IMAGES: ReadonlyMap<string, HTMLImageElement> = new Map();

/** overlap of ring segments so no hairline shows between two colors */
const SEGMENT_OVERLAP = 0.25;

export class FrameScene {
  readonly layer = new Konva.Layer();
  /** the photo; the editor makes it draggable */
  readonly photoNode = new KonvaImage({ image: undefined });

  private readonly background = new Rect({ listening: false });
  private readonly photoFill = new Circle({ listening: false });
  private readonly photoGroup = new Konva.Group();
  private readonly ring = new Konva.Group({ listening: false });
  private readonly stencil = new KonvaImage({ image: undefined, listening: false });
  private readonly decorations = new Konva.Group({ listening: false });
  private readonly badge = new Konva.Group({ listening: false });
  private readonly texts = new Konva.Group({ listening: false });
  /** clipped to the round frame, like the photo */
  private readonly stickers = new Konva.Group({ listening: false });
  private geometry: FrameGeometry | null = null;
  /** what each part was last built from; a part with the same inputs is kept */
  private readonly builtFrom = new Map<Konva.Group, readonly unknown[]>();

  constructor(private readonly size: number) {
    this.photoGroup.clipFunc((ctx) => {
      const g = this.geometry;
      if (g) {
        ctx.arc(g.center, g.center, g.photo, 0, Math.PI * 2);
      }
    });
    this.photoGroup.add(this.photoFill, this.photoNode);
    this.stickers.clipFunc((ctx) => {
      const g = this.geometry;
      if (g) {
        ctx.arc(g.center, g.center, g.outer, 0, Math.PI * 2);
      }
    });
    this.layer.add(
      this.background,
      this.photoGroup,
      this.ring,
      this.stencil,
      this.decorations,
      this.badge,
      this.texts,
      this.stickers,
    );
  }

  /** Updates every node; `opaqueBackground` fills the corners (JPEG has no transparency). */
  render(content: SceneContent, opaqueBackground?: string): FrameGeometry {
    const g = frameGeometry(this.size, content.config);
    this.geometry = g;

    this.background.setAttrs({
      width: this.size,
      height: this.size,
      fill: opaqueBackground,
      visible: !!opaqueBackground,
    });
    this.photoFill.setAttrs({
      x: g.center,
      y: g.center,
      radius: g.photo,
      fill: content.config.photoBackground,
    });
    this.placePhoto(g, content.photo, content.transform);
    this.photoGroup.visible(!content.frameOnly);

    const { config } = content;
    const shape = [g.outer, g.inner, content.revision ?? 0];
    this.rebuild(this.ring, [config.ring, ...shape], () =>
      config.ring ? ringNodes(g, config.ring) : [],
    );

    this.stencil.setAttrs({
      image: content.stencilImage ?? undefined,
      width: this.size,
      height: this.size,
      visible: !!content.stencilImage,
    });

    this.rebuild(this.decorations, [config.decorations, ...shape], () =>
      (config.decorations ?? []).map((d) => decorationNode(g, d)),
    );
    this.rebuild(this.badge, [config.badge, config.ring, config.photoBackground, ...shape], () =>
      config.badge ? [badgeNode(g, config, config.badge)] : [],
    );
    this.rebuild(this.texts, [config.texts, ...shape], () =>
      config.texts.map((t) => ringTextNode(g, t)).filter((n) => n !== null),
    );
    const images = content.stickerImages ?? NO_IMAGES;
    this.rebuild(this.stickers, [content.stickers, images, content.revision ?? 0], () =>
      (content.stickers ?? [])
        .map((s) => stickerNode(s, this.size, images))
        .filter((n) => n !== null),
    );
    return g;
  }

  /** Replaces the children of `group`, unless it was built from the same inputs (compared by reference). */
  private rebuild(group: Konva.Group, inputs: readonly unknown[], build: () => Konva.Node[]): void {
    const before = this.builtFrom.get(group);
    if (before?.length === inputs.length && before.every((value, i) => value === inputs[i])) {
      return;
    }
    this.builtFrom.set(group, inputs);
    group.destroyChildren();
    const nodes = build();
    if (nodes.length) {
      group.add(...(nodes as (Konva.Group | Konva.Shape)[]));
    }
  }

  /** Photo transform for a node position: the inverse of placePhoto, used while dragging. */
  offsetsAt(x: number, y: number): Pick<PhotoTransform, 'offsetX' | 'offsetY'> {
    const g = this.geometry;
    if (!g) {
      return { offsetX: 0, offsetY: 0 };
    }
    const diameter = g.photo * 2;
    return { offsetX: (x - g.center) / diameter, offsetY: (y - g.center) / diameter };
  }

  /** Node position of the photo center for a photo transform. */
  positionOf(p: Pick<PhotoTransform, 'offsetX' | 'offsetY'>): { x: number; y: number } {
    const g = this.geometry;
    if (!g) {
      return { x: this.size / 2, y: this.size / 2 };
    }
    const diameter = g.photo * 2;
    return { x: g.center + p.offsetX * diameter, y: g.center + p.offsetY * diameter };
  }

  private placePhoto(g: FrameGeometry, image: HTMLImageElement | null, p: PhotoTransform): void {
    const width = image?.naturalWidth ?? 0;
    const height = image?.naturalHeight ?? 0;
    if (!image || width === 0 || height === 0) {
      this.photoNode.setAttrs({ image: undefined, visible: false });
      return;
    }
    const diameter = g.photo * 2;
    // cover the circle, then the user's zoom
    const scale = (diameter / Math.min(width, height)) * p.zoom;
    this.photoNode.setAttrs({
      image,
      visible: true,
      width,
      height,
      offsetX: width / 2,
      offsetY: height / 2,
      x: g.center + p.offsetX * diameter,
      y: g.center + p.offsetY * diameter,
      rotation: p.rotation,
      scaleX: scale,
      scaleY: scale,
    });
  }
}

function ringNodes(g: FrameGeometry, ring: RingLayer): Konva.Shape[] {
  // a full ring starts its colors at 3 o'clock, a partial ring at its first end (as saved designs expect)
  const rotation = ring.arc ? konvaRotation(ring.arc.start) : 0;
  const sweep = ring.arc ? ring.arc.end - ring.arc.start : 360;
  const band = {
    x: g.center,
    y: g.center,
    innerRadius: g.inner,
    outerRadius: g.outer,
    rotation,
  };
  const nodes: Konva.Shape[] = [];
  switch (ring.fill.type) {
    case 'solid':
      nodes.push(new Arc({ ...band, angle: sweep, fill: ring.fill.color }));
      break;
    case 'segments': {
      const step = sweep / ring.fill.colors.length;
      ring.fill.colors.forEach((color, i) =>
        nodes.push(
          new Arc({
            ...band,
            rotation: band.rotation + i * step,
            angle: step + SEGMENT_OVERLAP,
            fill: color,
          }),
        ),
      );
      break;
    }
    case 'gradient':
      nodes.push(conicRing(g, ring.fill.colors, rotation, sweep));
      break;
  }
  if (ring.innerLine) {
    nodes.push(
      new Arc({
        ...band,
        outerRadius: g.inner + ring.innerLine.width * g.outer,
        angle: sweep,
        fill: ring.innerLine.color,
      }),
    );
  }
  return nodes;
}

/**
 * Konva has linear and radial gradients only. The colored ring needs a conic one, so it is drawn with the
 * browser's own gradient; browsers without conic gradients get the first color.
 */
function conicRing(
  g: FrameGeometry,
  colors: readonly string[],
  rotation: number,
  sweep: number,
): Konva.Shape {
  if (colors.length < 2 || !conicSupported()) {
    return new Arc({
      x: g.center,
      y: g.center,
      innerRadius: g.inner,
      outerRadius: g.outer,
      rotation,
      angle: sweep,
      fill: colors[0] ?? 'transparent',
    });
  }
  const from = (rotation * Math.PI) / 180;
  const to = from + (sweep * Math.PI) / 180;
  const span = sweep / 360;
  // a full ring repeats the first color, so there is no seam at the start
  const stops = span >= 1 ? colors.concat(colors.slice(0, 1)) : colors;
  return new Konva.Shape({
    sceneFunc: (ctx) => {
      // Konva's wrapper has no conic gradient; its underlying 2D context (private API, Konva pinned to 10.11.0)
      const native = ctx._context;
      const gradient = native.createConicGradient(from, g.center, g.center);
      stops.forEach((color, i) =>
        gradient.addColorStop(Math.min(1, (span * i) / (stops.length - 1)), color),
      );
      native.beginPath();
      native.arc(g.center, g.center, g.outer, from, to);
      native.arc(g.center, g.center, g.inner, to, from, true);
      native.closePath();
      native.fillStyle = gradient;
      native.fill();
    },
  });
}

function conicSupported(): boolean {
  return (
    typeof CanvasRenderingContext2D !== 'undefined' &&
    typeof CanvasRenderingContext2D.prototype.createConicGradient === 'function'
  );
}
