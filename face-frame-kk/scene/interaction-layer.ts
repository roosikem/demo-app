import Konva from './konva';
import { Arc, Circle, Line, Rect, RectConfig, Transformer } from './konva';
import { Point } from '../models/pointer';
import {
  ROTATE_HANDLE_DISTANCE,
  STICKER_SIZE,
  Sticker,
  clampSticker,
  handleSides,
} from '../stickers/sticker.model';
import { FrameGeometry, konvaRotation } from '../layout/frame-geometry';
import { textBand } from '../layout/text-metrics';

// What the user can grab on the preview, above the frame: stickers, the round badge and the texts on the ring. The
// grab areas are invisible: Konva finds what was pressed and runs the drag, and its Transformer resizes and turns
// the selected sticker. Every change is reported to the editor, which shows it and saves it on release. The dashed
// outline shows what is selected. Positions passed in and out are fractions of the frame (0 .. 1).

/** a press this close to a text (degrees beyond its ends) still grabs it */
const TEXT_HIT_SLACK = 3;
const OUTLINE = 'rgb(255 255 255 / 85%)';
const INVISIBLE = 'rgba(0,0,0,0)';
/** drawn radius of the sticker handles, fraction of the frame */
const HANDLE_RADIUS = 0.022;
/** Shift while turning a sticker snaps to this */
const ROTATE_SNAP = 15;
/** selection color until the editor sends the page's own */
const DEFAULT_COLOR = '#00646d';

export interface InteractionHandlers {
  badgeDown(pointer: Point): void;
  /** returns where the badge is shown, or null when no drag runs */
  badgeMove(pointer: Point): Point | null;
  badgeUp(): void;
  textDown(index: number, pointer: Point): void;
  textMove(pointer: Point): void;
  textUp(): void;
  stickerDown(id: string): void;
  /** a sticker dragged, resized or turned: shown, not saved */
  stickerChange(draft: Sticker): void;
  stickerUp(result: Sticker): void;
}

export interface InteractionView {
  readonly geometry: FrameGeometry;
  /** the movable badge (center, radius, radius with gap), or null */
  readonly badge: {
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly outer: number;
  } | null;
  readonly badgeSelected: boolean;
  /** the movable texts (center and half span in degrees); null for an empty one */
  readonly texts: readonly ({ readonly center: number; readonly half: number } | null)[];
  readonly textSelected: number | null;
  /** the stickers that can be moved (empty while a premade stencil is applied), with a running drag */
  readonly stickers: readonly Sticker[];
  readonly stickerSelected: string | null;
  /** selection color, the page's --ff-primary */
  readonly color: string;
}

export class InteractionLayer {
  readonly layer = new Konva.Layer();
  private readonly badgeHandle = new Circle({ fill: INVISIBLE, draggable: true });
  private readonly textHandles: Konva.Shape[];
  private readonly outlines = new Konva.Group({ listening: false });
  private readonly stickerGroup = new Konva.Group();
  private readonly proxies = new Map<string, Rect>();
  /** light line under the transformer border and to the rotate knob, so it shows on dark and light photos */
  private readonly halo = new Konva.Group({ listening: false });
  private readonly transformer: Transformer;
  private readonly lineWidth: number;
  private readonly dash: number[];
  private view: InteractionView | null = null;
  /** set by stop(): the rest of that gesture (moves, release) is ignored until the next press */
  private stopped = false;

  constructor(
    private readonly size: number,
    private readonly handlers: InteractionHandlers,
  ) {
    this.lineWidth = Math.max(1, size / 240);
    this.dash = [size / 60, size / 90];
    this.textHandles = [0, 1].map((index) => this.textHandle(index));
    this.badgeHandle.on('pointerdown', () => {
      this.stopped = false;
      handlers.badgeDown(this.pointer());
    });
    this.badgeHandle.on('dragmove', () => {
      const at = this.stopped ? null : handlers.badgeMove(this.pointer());
      if (at) {
        this.badgeHandle.position({ x: at.x * size, y: at.y * size });
      }
    });
    this.badgeHandle.on('dragend', () => {
      if (!this.stopped) {
        handlers.badgeUp();
      }
      // back over the badge as drawn, also when nothing was saved
      this.placeBadgeHandle();
    });
    this.transformer = this.createTransformer();
    // a resize or turn starts on a transformer handle, not on the sticker: a new gesture after Escape
    this.transformer.on('transformstart', () => (this.stopped = false));
    // later is on top: a press takes a sticker first, then the badge, then a text
    this.layer.add(
      ...this.textHandles,
      this.badgeHandle,
      this.stickerGroup,
      this.outlines,
      this.halo,
      this.transformer,
    );
  }

  /** true for a node of this layer: a press there is not a press on the photo */
  owns(node: Konva.Node): boolean {
    return (
      node === this.badgeHandle ||
      this.textHandles.includes(node as Konva.Shape) ||
      [...this.proxies.values()].includes(node as Rect) ||
      node.getParent()?.getParent() === this.transformer ||
      node.getParent() === this.transformer
    );
  }

  /** Escape: ends a running drag or resize on the spot; the movers drop the unsaved change. */
  stop(): void {
    this.stopped = true;
    for (const node of [this.badgeHandle, ...this.textHandles, ...this.proxies.values()]) {
      if (node.isDragging()) {
        node.stopDrag();
      }
    }
    if (this.transformer.isTransforming()) {
      this.transformer.stopTransform();
    }
    if (this.view) {
      this.update(this.view);
    }
  }

  update(view: InteractionView): void {
    this.view = view;
    this.placeBadgeHandle();
    this.textHandles.forEach((handle, i) => handle.visible(!!view.texts[i]));
    this.syncStickers(view);
    this.drawOutlines(view);
    this.layer.batchDraw();
  }

  private placeBadgeHandle(): void {
    const badge = this.view?.badge;
    this.badgeHandle.setAttrs({
      visible: !!badge,
      x: (badge?.x ?? 0) * this.size,
      y: (badge?.y ?? 0) * this.size,
      radius: (badge?.r ?? 0) * this.size,
    });
  }

  private syncStickers(view: InteractionView): void {
    const ids = new Set(view.stickers.map((s) => s.id));
    for (const [id, proxy] of this.proxies) {
      if (!ids.has(id)) {
        proxy.destroy();
        this.proxies.delete(id);
      }
    }
    view.stickers.forEach((s, index) => {
      const proxy = this.proxies.get(s.id) ?? this.createProxy(s.id);
      proxy.setAttrs({ ...this.box(s), x: s.x * this.size, y: s.y * this.size });
      proxy.zIndex(index);
    });
    const selected = view.stickers.find((s) => s.id === view.stickerSelected);
    const proxy = selected ? this.proxies.get(selected.id) : undefined;
    this.halo.destroyChildren();
    if (!selected || !proxy) {
      if (this.transformer.nodes().length) {
        this.transformer.nodes([]);
      }
      return;
    }
    const sides = handleSides(selected);
    // a running resize or turn keeps its transformer as it is
    if (!this.transformer.isTransforming()) {
      this.transformer.setAttrs({
        enabledAnchors: [sides.corner],
        rotateAnchorAngle: sides.rotate,
        borderStroke: view.color,
      });
      if (this.transformer.nodes()[0] !== proxy) {
        this.transformer.nodes([proxy]);
      }
      this.transformer.forceUpdate();
    }
    this.drawHalo(selected, sides.rotate, view.color);
  }

  private createProxy(id: string): Rect {
    const proxy = new Rect({ fill: INVISIBLE, draggable: true });
    proxy.on('pointerdown', () => {
      this.stopped = false;
      this.handlers.stickerDown(id);
    });
    proxy.on('dragmove', () => {
      const s = this.stopped ? null : this.stickerFrom(id, proxy);
      if (s) {
        proxy.position({ x: s.x * this.size, y: s.y * this.size });
        this.handlers.stickerChange(s);
      }
    });
    proxy.on('transform', (event) => {
      const s = this.stopped ? null : this.stickerFrom(id, proxy, isShift(event.evt));
      if (s) {
        proxy.setAttrs(this.box(s));
        this.handlers.stickerChange(s);
      }
    });
    const end = (): void => {
      const s = this.stopped ? null : this.stickerFrom(id, proxy);
      if (s) {
        this.handlers.stickerUp(s);
      } else if (this.view) {
        // stopped: back to the sticker as saved
        this.syncStickers(this.view);
      }
    };
    proxy.on('dragend', end);
    proxy.on('transformend', end);
    this.stickerGroup.add(proxy);
    this.proxies.set(id, proxy);
    return proxy;
  }

  /** Size and turn of a sticker's grab area; the Transformer's scale is folded into the size. */
  private box(s: Sticker): RectConfig {
    const box = s.size * this.size;
    return {
      width: box,
      height: box,
      offsetX: box / 2,
      offsetY: box / 2,
      rotation: s.rotation,
      scaleX: 1,
      scaleY: 1,
    };
  }

  /** The sticker as the proxy node has it now, within the limits of the model. */
  private stickerFrom(id: string, proxy: Rect, snap = false): Sticker | null {
    const s = this.view?.stickers.find((item) => item.id === id);
    if (!s) {
      return null;
    }
    const rotation = snap
      ? Math.round(proxy.rotation() / ROTATE_SNAP) * ROTATE_SNAP
      : proxy.rotation();
    return clampSticker({
      ...s,
      x: proxy.x() / this.size,
      y: proxy.y() / this.size,
      size: (proxy.width() * proxy.scaleX()) / this.size,
      rotation,
    });
  }

  private createTransformer(): Transformer {
    const lineWidth = this.lineWidth;
    const anchor = HANDLE_RADIUS * 2 * this.size;
    return new Transformer({
      keepRatio: true,
      // grows from the middle, like the corner handle of the Canvas 2D editor
      centeredScaling: true,
      flipEnabled: false,
      ignoreStroke: true,
      rotateAnchorOffset: ROTATE_HANDLE_DISTANCE * this.size,
      anchorSize: anchor,
      borderStrokeWidth: lineWidth,
      borderDash: this.dash,
      anchorStyleFunc: (a) => {
        const color = this.view?.color ?? DEFAULT_COLOR;
        const rotater = a.hasName('rotater');
        a.setAttrs({
          cornerRadius: anchor / 2,
          fill: rotater ? color : '#ffffff',
          stroke: rotater ? '#ffffff' : color,
          strokeWidth: lineWidth * 1.5,
        });
      },
      boundBoxFunc: (oldBox, newBox) => {
        const min = STICKER_SIZE.min * this.size;
        const max = STICKER_SIZE.max * this.size;
        return newBox.width < min || newBox.width > max ? oldBox : newBox;
      },
    });
  }

  private drawHalo(s: Sticker, rotateSide: number, color: string): void {
    const lineWidth = this.lineWidth;
    const half = (s.size / 2) * this.size;
    const reach = half + ROTATE_HANDLE_DISTANCE * this.size;
    const group = new Konva.Group({ x: s.x * this.size, y: s.y * this.size, rotation: s.rotation });
    group.add(
      new Rect({
        x: -half,
        y: -half,
        width: half * 2,
        height: half * 2,
        stroke: OUTLINE,
        strokeWidth: lineWidth * 3,
      }),
    );
    // the line to the rotate knob, from the sticker edge
    const a = (rotateSide * Math.PI) / 180;
    const dir = { x: Math.sin(a), y: -Math.cos(a) };
    const points = [dir.x * half, dir.y * half, dir.x * reach, dir.y * reach];
    group.add(
      new Line({ points, stroke: OUTLINE, strokeWidth: lineWidth * 3 }),
      new Line({ points, stroke: color, strokeWidth: lineWidth }),
    );
    this.halo.add(group);
  }

  private textHandle(index: number): Konva.Shape {
    const handle = new Konva.Shape({
      fill: INVISIBLE,
      draggable: true,
      visible: false,
      sceneFunc: () => undefined,
      hitFunc: (ctx, shape) => {
        const text = this.view?.texts[index];
        const g = this.view?.geometry;
        if (!text || !g) {
          return;
        }
        const from = (konvaRotation(text.center - text.half - TEXT_HIT_SLACK) * Math.PI) / 180;
        const to = (konvaRotation(text.center + text.half + TEXT_HIT_SLACK) * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(g.center, g.center, g.outer, from, to);
        ctx.arc(g.center, g.center, g.outer - textBand(g), to, from, true);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
    });
    handle.on('pointerdown', () => {
      this.stopped = false;
      this.handlers.textDown(index, this.pointer());
    });
    // the band stays where it is; the text follows the pointer around the ring
    handle.on('dragmove', () => {
      handle.position({ x: 0, y: 0 });
      if (!this.stopped) {
        this.handlers.textMove(this.pointer());
      }
    });
    handle.on('dragend', () => {
      handle.position({ x: 0, y: 0 });
      if (!this.stopped) {
        this.handlers.textUp();
      }
    });
    return handle;
  }

  private drawOutlines(view: InteractionView): void {
    this.outlines.destroyChildren();
    const { lineWidth, dash } = this;
    const pair = (make: (stroke: string, width: number, dashed: boolean) => Konva.Shape): void => {
      this.outlines.add(make(OUTLINE, lineWidth * 3, false), make(view.color, lineWidth, true));
    };
    if (view.badge && view.badgeSelected) {
      const { x, y, outer } = view.badge;
      pair(
        (stroke, width, dashed) =>
          new Circle({
            x: x * this.size,
            y: y * this.size,
            radius: outer * this.size + lineWidth * 2,
            stroke,
            strokeWidth: width,
            dash: dashed ? dash : undefined,
          }),
      );
    }
    const text = view.textSelected === null ? null : view.texts[view.textSelected];
    if (text) {
      const g = view.geometry;
      pair(
        (stroke, width, dashed) =>
          new Arc({
            x: g.center,
            y: g.center,
            innerRadius: g.outer - textBand(g) + lineWidth,
            outerRadius: g.outer - lineWidth,
            rotation: konvaRotation(text.center - text.half - 1),
            angle: text.half * 2 + 2,
            stroke,
            strokeWidth: width,
            dash: dashed ? dash : undefined,
          }),
      );
    }
  }

  private pointer(): Point {
    const p = this.layer.getStage()?.getPointerPosition() ?? { x: 0, y: 0 };
    return { x: p.x / this.size, y: p.y / this.size };
  }
}

function isShift(evt: unknown): boolean {
  return typeof evt === 'object' && evt !== null && 'shiftKey' in evt && evt.shiftKey === true;
}
