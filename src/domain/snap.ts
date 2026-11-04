/**
 * 智能吸附。
 *
 * 吸附基准为画布的边与中线、其他图片的边与中线。移动对象的候选边取选中集合包围盒的
 * 左中右与上中下，而不是每个对象各自的边：多选拖动时逐对象吸附会让对象互相拉扯变形。
 *
 * 返回值包含修正后的位移与辅助线（辅助线只画在视图上，不进入导出）。
 * 阈值由调用方按屏幕像素折算成画布坐标，保证不同缩放下手感一致。
 */

import type { CanvasSpec, DocumentState, Frame, Id } from "./types";

export type SnapAxis = "x" | "y";

export interface SnapGuide {
  axis: SnapAxis;
  /** 辅助线位置：axis=x 时为垂直线，axis=y 时为水平线 */
  position: number;
  /** 线的可视范围（沿另一轴） */
  start: number;
  end: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

interface Line {
  axis: SnapAxis;
  position: number;
  start: number;
  end: number;
}

/** 一个矩形贡献 3 条竖线 + 3 条横线（左边/中线/右边、上边/中线/下边） */
function linesOf(frame: Frame): Line[] {
  const { x, y, w, h } = frame;
  return [
    { axis: "x", position: x, start: y, end: y + h },
    { axis: "x", position: x + w / 2, start: y, end: y + h },
    { axis: "x", position: x + w, start: y, end: y + h },
    { axis: "y", position: y, start: x, end: x + w },
    { axis: "y", position: y + h / 2, start: x, end: x + w },
    { axis: "y", position: y + h, start: x, end: x + w },
  ];
}

export function canvasLines(canvas: CanvasSpec): Line[] {
  return [
    { axis: "x", position: 0, start: 0, end: canvas.height },
    { axis: "x", position: canvas.width / 2, start: 0, end: canvas.height },
    { axis: "x", position: canvas.width, start: 0, end: canvas.height },
    { axis: "y", position: 0, start: 0, end: canvas.width },
    { axis: "y", position: canvas.height / 2, start: 0, end: canvas.width },
    { axis: "y", position: canvas.height, start: 0, end: canvas.width },
  ];
}

function unionBounds(frames: readonly Frame[]): Frame | null {
  if (frames.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of frames) {
    minX = Math.min(minX, f.x);
    minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.w);
    maxY = Math.max(maxY, f.y + f.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function mergeGuides(list: Line[]): SnapGuide[] {
  const byKey = new Map<string, SnapGuide>();
  for (const l of list) {
    const key = `${l.axis}:${l.position.toFixed(2)}`;
    const hit = byKey.get(key);
    if (hit) {
      hit.start = Math.min(hit.start, l.start);
      hit.end = Math.max(hit.end, l.end);
    } else {
      byKey.set(key, { axis: l.axis, position: l.position, start: l.start, end: l.end });
    }
  }
  return [...byKey.values()];
}

/**
 * 计算吸附后的位移与辅助线。
 *
 * @param doc      当前文档（移动对象在此文档中的位置是上一次提交的结果，会被忽略）
 * @param movingIds 正在移动的实例 id
 * @param baseFrames 拖动开始时这些实例的外框（吸附必须基于起点计算，否则增量会累积漂移）
 * @param dx,dy    本次指针相对拖动起点的原始位移
 * @param threshold 吸附阈值（画布坐标单位）；传 0 表示禁用吸附（按住 Alt 时）
 */
export function snapMove(
  doc: DocumentState,
  movingIds: readonly Id[],
  baseFrames: readonly Frame[],
  dx: number,
  dy: number,
  threshold: number,
): SnapResult {
  if (threshold <= 0 || baseFrames.length === 0) {
    return { dx, dy, guides: [] };
  }

  const moving = new Set(movingIds);
  const targets: Line[] = [
    ...canvasLines(doc.canvas),
    ...doc.instances.filter((it) => !moving.has(it.id)).flatMap((it) => linesOf(it.frame)),
  ];

  const start = unionBounds(baseFrames);
  if (!start) return { dx, dy, guides: [] };

  const box: Frame = { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h };

  // ---- 横轴（竖直辅助线）----
  let bestX: number | null = null;
  const edgesX = [box.x, box.x + box.w / 2, box.x + box.w];
  for (const line of targets) {
    if (line.axis !== "x") continue;
    for (const edge of edgesX) {
      const diff = line.position - edge;
      if (Math.abs(diff) > threshold) continue;
      if (bestX === null || Math.abs(diff) < Math.abs(bestX)) bestX = diff;
    }
  }
  if (bestX !== null) box.x += bestX;

  // ---- 纵轴（水平辅助线）----
  let bestY: number | null = null;
  const edgesY = [box.y, box.y + box.h / 2, box.y + box.h];
  for (const line of targets) {
    if (line.axis !== "y") continue;
    for (const edge of edgesY) {
      const diff = line.position - edge;
      if (Math.abs(diff) > threshold) continue;
      if (bestY === null || Math.abs(diff) < Math.abs(bestY)) bestY = diff;
    }
  }
  if (bestY !== null) box.y += bestY;

  // ---- 辅助线：与该位置重合的所有基准线合并成一段 ----
  const EPS = 0.5;
  const snapX = [box.x, box.x + box.w / 2, box.x + box.w];
  const snapY = [box.y, box.y + box.h / 2, box.y + box.h];

  const guideLines: Line[] = [];
  for (const line of targets) {
    const edges = line.axis === "x" ? snapX : snapY;
    if (!edges.some((e) => Math.abs(e - line.position) <= EPS)) continue;
    if (line.axis === "x") {
      guideLines.push({
        axis: "x",
        position: line.position,
        start: Math.min(line.start, box.y),
        end: Math.max(line.end, box.y + box.h),
      });
    } else {
      guideLines.push({
        axis: "y",
        position: line.position,
        start: Math.min(line.start, box.x),
        end: Math.max(line.end, box.x + box.w),
      });
    }
  }

  return {
    dx: dx + (bestX ?? 0),
    dy: dy + (bestY ?? 0),
    guides: mergeGuides(guideLines),
  };
}
