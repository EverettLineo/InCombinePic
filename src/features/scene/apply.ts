/**
 * Konva 适配层：把 SceneDescriptor 投影到 Konva 节点树。
 *
 * 这是全项目唯一 import Konva 的地方（eslint 强制）。
 * 节点树是**投影**，随时可以整体重建；文档状态永远是真相。
 */

import Konva from "konva";
import type { SnapGuide } from "../../domain/snap";
import { containCrop, coverCrop, frameCenter, handlePoints, toImageCrop } from "../../domain/transform";
import type { Background, CanvasSpec, DocumentState, Frame, Id } from "../../domain/types";
import type { SceneDescriptor } from "./derive";

/** 控制点在屏幕上的边长（px），与视图缩放无关 */
const HANDLE_SIZE_PX = 7;

/** Group → 其子节点引用。用 WeakMap 避免每次同步都做选择器查找 */
const bundles = new WeakMap<Konva.Group, { image: Konva.Image; border: Konva.Rect }>();

/** 棋盘格仅用于透明背景的预览提示，不是用户可选的背景类型（基线 §10.1） */
function makeCheckerPattern(): HTMLCanvasElement {
  const size = 16;
  const c = document.createElement("canvas");
  c.width = size * 2;
  c.height = size * 2;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size * 2, size * 2);
  ctx.fillStyle = "#e6e8eb";
  ctx.fillRect(0, 0, size, size);
  ctx.fillRect(size, size, size, size);
  return c;
}

function applyBackgroundFill(rect: Konva.Rect, bg: Background, canvas: CanvasSpec) {
  switch (bg.type) {
    case "transparent":
      rect.fillPriority("pattern");
      rect.fillPatternImage(makeCheckerPattern());
      rect.fillPatternRepeat("repeat");
      break;
    case "solid":
      rect.fillPriority("color");
      rect.fill(bg.color);
      break;
    case "linear": {
      // Konva 支持线性渐变填充；角度换算为起止点
      const rad = (bg.angle * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      rect.fillPriority("linear-gradient");
      rect.fillLinearGradientStartPoint({ x: canvas.width * (0.5 - dx / 2), y: canvas.height * (0.5 - dy / 2) });
      rect.fillLinearGradientEndPoint({ x: canvas.width * (0.5 + dx / 2), y: canvas.height * (0.5 + dy / 2) });
      rect.fillLinearGradientColorStops([0, bg.from, 1, bg.to]);
      break;
    }
    case "white":
    default:
      rect.fillPriority("color");
      rect.fill("#ffffff");
      break;
  }
}

/** 背景层：始终与画布尺寸一致 */
export function syncBackground(layer: Konva.Layer, canvas: CanvasSpec) {
  let rect = layer.findOne<Konva.Rect>("#canvas-bg");
  if (!rect) {
    rect = new Konva.Rect({ listening: false });
    rect.id("canvas-bg");
    layer.add(rect);
  }
  rect.position({ x: 0, y: 0 });
  rect.width(canvas.width);
  rect.height(canvas.height);
  applyBackgroundFill(rect, canvas.background, canvas);
}

/**
 * 内容层：按 id 做 diff，只更新变化项。
 * 未就绪的图像直接跳过——宁可先不画，也不要画在错误位置或拉伸变形。
 *
 * 每个实例是一个 Group（承载位置/旋转/透明度/圆角裁剪）+ 一个 Image（承载裁剪与翻转）
 * + 一个 Rect（边框）。分组的理由：Konva 的 Image 是 Shape 不是容器，无法自己裁剪自身；
 * 圆角必须靠父容器的 clipFunc 实现。
 */
export function syncLayer(layer: Konva.Layer, scene: SceneDescriptor): void {
  const existing = new Map<string, Konva.Group>();
  for (const child of layer.getChildren()) {
    existing.set(child.id(), child as Konva.Group);
  }

  const alive = new Set<string>();

  scene.nodes.forEach((n, index) => {
    if (!n.source) return;
    alive.add(n.id);

    const r =
      n.fitMode === "contain"
        ? containCrop(n.crop, n.rotation, n.frame)
        : coverCrop(n.crop, n.rotation, n.frame);
    if (r.scale <= 0) return;
    const { cx, cy } = frameCenter(n.frame);

    let group = existing.get(n.id);
    let bundle = group ? bundles.get(group) : undefined;
    if (!group || !bundle) {
      const image = new Konva.Image({
        image: undefined as unknown as HTMLImageElement,
        listening: false,
      });
      const border = new Konva.Rect({ listening: false, fillEnabled: false });
      group = new Konva.Group({ id: n.id, listening: false });
      group.add(image);
      group.add(border);
      bundles.set(group, { image, border });
      layer.add(group);
      bundle = { image, border };
    }

    const { image, border } = bundle;
    const ic = toImageCrop(r.crop, n.source.pixelScale);
    image.image(n.source.image as HTMLImageElement);
    image.crop({ x: ic.x, y: ic.y, width: ic.w, height: ic.h });
    image.width(r.drawW);
    image.height(r.drawH);
    image.offsetX(r.drawW / 2);
    image.offsetY(r.drawH / 2);
    image.position({ x: 0, y: 0 });
    image.scaleX(n.flipH ? -1 : 1);
    image.scaleY(n.flipV ? -1 : 1);

    group.position({ x: cx, y: cy });
    group.rotation(n.rotation);
    group.opacity(n.opacity);
    group.zIndex(index);

    // 圆角：按显示框裁剪内容。半径上限取短边一半，否则路径自交会画出奇怪形状
    const halfW = n.frame.w / 2;
    const halfH = n.frame.h / 2;
    group.clipFunc((ctx) => {
      roundedRectPath(ctx, -halfW, -halfH, n.frame.w, n.frame.h, n.cornerRadius);
    });

    // 边框画在显示框**内侧**：格子是拼接的基本单元，向外画会压到相邻图（ADR-0006）
    const bw = Math.max(0, n.border.width);
    border.visible(bw > 0);
    if (bw > 0) {
      const inset = bw / 2;
      const iw = Math.max(1, n.frame.w - bw);
      const ih = Math.max(1, n.frame.h - bw);
      border.position({ x: -halfW + inset, y: -halfH + inset });
      border.width(iw);
      border.height(ih);
      border.stroke(n.border.color);
      border.strokeWidth(bw);
      border.cornerRadius(
        Math.max(0, Math.min(n.cornerRadius - inset, Math.min(iw, ih) / 2)),
      );
    }
  });

  // 移除已不存在的实例（例如释放资源后其关联实例被删除）
  for (const [id, node] of existing) {
    if (!alive.has(id)) node.destroy();
  }
}

/** 圆角矩形路径（供 clipFunc 使用；Konva 的 Context 代理了 2D 上下文方法） */
function roundedRectPath(
  ctx: Konva.Context,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    ctx.closePath();
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** 画布边界线：帮助用户看清导出范围，不导出（基线 §10.2） */
export function syncCanvasOutline(layer: Konva.Layer, canvas: CanvasSpec) {
  let rect = layer.findOne<Konva.Rect>("#canvas-outline");
  if (!rect) {
    rect = new Konva.Rect({
      listening: false,
      stroke: "#c9ced6",
      strokeWidth: 1,
      strokeScaleEnabled: false,
    });
    rect.id("canvas-outline");
    layer.add(rect);
  }
  rect.position({ x: 0, y: 0 });
  rect.width(canvas.width);
  rect.height(canvas.height);
}

/**
 * 选中高亮：在覆盖层为每个选中实例画一个描边框。
 * 数量最多几个，直接全量重建即可，无需 diff。
 */
export function syncSelection(
  layer: Konva.Layer,
  doc: DocumentState,
  selection: readonly Id[],
  zoom = 1,
): void {
  for (const child of layer.getChildren()) {
    const id = child.id();
    if (id.startsWith("sel-") || id.startsWith("handle-")) child.destroy();
  }
  if (selection.length === 0) return;

  const selected = new Set(selection);
  const targets = doc.instances.filter((it) => selected.has(it.id));

  for (const it of targets) {
    layer.add(
      new Konva.Rect({
        id: `sel-${it.id}`,
        listening: false,
        stroke: "#2f7ce0",
        strokeWidth: 1.5,
        strokeScaleEnabled: false,
        dash: [4, 3],
        x: it.frame.x,
        y: it.frame.y,
        width: it.frame.w,
        height: it.frame.h,
      }),
    );
  }

  // 仅在单选时显示控制点：多选的批量缩放按基线不在 v1 范围（§8.1）
  if (targets.length === 1) {
    const size = HANDLE_SIZE_PX / (zoom || 1);
    for (const hp of handlePoints(targets[0].frame)) {
      layer.add(
        new Konva.Rect({
          id: `handle-${hp.kind}`,
          listening: false,
          x: hp.x - size / 2,
          y: hp.y - size / 2,
          width: size,
          height: size,
          fill: "#ffffff",
          stroke: "#2f7ce0",
          strokeWidth: 1.5,
          strokeScaleEnabled: false,
        }),
      );
    }
  }
}

/**
 * 对齐辅助线（T6.6）：只在视图上画，**不进导出**（基线 §10.2）。
 * 线宽 1px 且不随缩放变化，避免放大后辅助线变成色块。
 */
export function syncGuides(layer: Konva.Layer, guides: readonly SnapGuide[]): void {
  for (const child of layer.getChildren()) {
    if (child.id().startsWith("guide-")) child.destroy();
  }
  guides.forEach((g, i) => {
    const points =
      g.axis === "x"
        ? [g.position, g.start, g.position, g.end]
        : [g.start, g.position, g.end, g.position];
    layer.add(
      new Konva.Line({
        id: `guide-${i}`,
        listening: false,
        stroke: "#e0457b",
        strokeWidth: 1,
        strokeScaleEnabled: false,
        dash: [5, 4],
        points,
      }),
    );
  });
}

/**
 * 空白单元格占位（T8.4 / T8.5）：虚线框 + 淡底，告诉用户"这里可以放图"。
 * 画在背景层，图片覆盖其上；不进导出。
 */
export function syncEmptyCells(layer: Konva.Layer, cells: readonly Frame[]): void {
  for (const child of layer.getChildren()) {
    if (child.id().startsWith("cell-")) child.destroy();
  }
  cells.forEach((f, i) => {
    layer.add(
      new Konva.Rect({
        id: `cell-${i}`,
        listening: false,
        x: f.x,
        y: f.y,
        width: f.w,
        height: f.h,
        fill: "#eef2f8",
        stroke: "#b9c3d1",
        strokeWidth: 1,
        strokeScaleEnabled: false,
        dash: [6, 6],
      }),
    );
  });
}
