/**
 * Konva 适配层：把 SceneDescriptor 投影到 Konva 节点树。
 *
 * 这是全项目唯一 import Konva 的地方（eslint 强制）。
 * 节点树是**投影**，随时可以整体重建；文档状态永远是真相。
 */

import Konva from "konva";
import { coverCrop, frameCenter } from "../../domain/transform";
import type { Background, CanvasSpec, DocumentState, Id } from "../../domain/types";
import type { SceneDescriptor } from "./derive";

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
 */
export function syncLayer(layer: Konva.Layer, scene: SceneDescriptor): void {
  const existing = new Map<string, Konva.Image>();
  for (const child of layer.getChildren()) {
    existing.set(child.id(), child as Konva.Image);
  }

  const alive = new Set<string>();

  scene.nodes.forEach((n, index) => {
    if (!n.source) return;
    alive.add(n.id);

    const r = coverCrop(n.crop, n.rotation, n.frame);
    if (r.scale <= 0) return;
    const { cx, cy } = frameCenter(n.frame);

    let node = existing.get(n.id);
    if (!node) {
      node = new Konva.Image({ image: n.source.image as HTMLImageElement, listening: false });
      node.id(n.id);
      layer.add(node);
    } else {
      node.image(n.source.image as HTMLImageElement);
    }

    node.crop({ x: r.crop.x, y: r.crop.y, width: r.crop.w, height: r.crop.h });
    node.width(r.drawW);
    node.height(r.drawH);
    node.offsetX(r.drawW / 2);
    node.offsetY(r.drawH / 2);
    node.position({ x: cx, y: cy });
    node.rotation(n.rotation);
    node.scaleX(n.flipH ? -1 : 1);
    node.scaleY(n.flipV ? -1 : 1);
    node.opacity(n.opacity);
    node.zIndex(index);
  });

  // 移除已不存在的实例（例如释放资源后其关联实例被删除）
  for (const [id, node] of existing) {
    if (!alive.has(id)) node.destroy();
  }
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
): void {
  for (const child of layer.getChildren()) {
    if (child.id().startsWith("sel-")) child.destroy();
  }
  if (selection.length === 0) return;

  const selected = new Set(selection);
  for (const it of doc.instances) {
    if (!selected.has(it.id)) continue;
    const rect = new Konva.Rect({
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
    });
    layer.add(rect);
  }
}
