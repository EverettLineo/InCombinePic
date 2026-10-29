/**
 * 多选对齐与等间距分布（T6.2 / T6.4）。
 *
 * 语义约定（写进 ADR-0005）：
 * - **对齐基准是多选包围盒**，不是画布。多选对齐的意义在于让若干对象互相对齐；
 *   若以画布为基准，用户在画布任意位置多选后点"左对齐"，全部对象会飞向左边缘，
 *   多数情况下不是想要的结果。单选时对齐无意义，函数直接返回原对象（UI 侧禁用按钮）。
 * - **位置取整到整数像素**。导出与渲染都以像素为单位，半像素会让边缘发虚（基线 §10.3）。
 * - **分布保持首尾不动**，只重排中间对象，且按"边缘等距"而非"中心等距"。
 *   边缘等距是设计工具的通用做法：宽度不同的图片按中心等距会看起来疏密不均。
 */

import { updateInstance } from "./document";
import type { DocumentState, Frame, Id } from "./types";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 选中集合的包围盒；无有效选中时返回 null */
export function selectionBounds(doc: DocumentState, ids: readonly Id[]): Bounds | null {
  const set = new Set(ids);
  const list = doc.instances.filter((it) => set.has(it.id));
  if (list.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of list) {
    const f = it.frame;
    minX = Math.min(minX, f.x);
    minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.w);
    maxY = Math.max(maxY, f.y + f.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** 只应用真正发生变化的 frame，避免无意义的引用变化与撤销步骤 */
function applyFrames(
  doc: DocumentState,
  changes: ReadonlyArray<{ id: Id; frame: Frame }>,
): DocumentState {
  let next = doc;
  for (const c of changes) {
    const it = next.instances.find((i) => i.id === c.id);
    if (!it) continue;
    const f = it.frame;
    if (f.x === c.frame.x && f.y === c.frame.y && f.w === c.frame.w && f.h === c.frame.h) {
      continue;
    }
    next = updateInstance(next, c.id, { frame: c.frame });
  }
  return next;
}

/**
 * 六向对齐。少于 2 个有效对象时返回原对象（单选对齐无意义）。
 */
export function alignInstances(
  doc: DocumentState,
  ids: readonly Id[],
  mode: AlignMode,
): DocumentState {
  const set = new Set(ids);
  const list = doc.instances.filter((it) => set.has(it.id));
  if (list.length < 2) return doc;

  const b = selectionBounds(doc, ids);
  if (!b) return doc;

  const changes = list.map((it) => {
    const f = it.frame;
    let x = f.x;
    let y = f.y;
    switch (mode) {
      case "left":
        x = b.x;
        break;
      case "hcenter":
        x = b.x + (b.w - f.w) / 2;
        break;
      case "right":
        x = b.x + b.w - f.w;
        break;
      case "top":
        y = b.y;
        break;
      case "vcenter":
        y = b.y + (b.h - f.h) / 2;
        break;
      case "bottom":
        y = b.y + b.h - f.h;
        break;
    }
    return { id: it.id, frame: { x: Math.round(x), y: Math.round(y), w: f.w, h: f.h } };
  });

  return applyFrames(doc, changes);
}

/**
 * 等间距分布：保持首尾对象位置不变，其余按"边缘间隙相等"重排。
 * 少于 3 个有效对象时返回原对象（2 个对象之间只有一段间隙，无需分布）。
 *
 * 间隙可能为负——对象本来就重叠时，等距分布意味着均匀重叠，这是正确行为，
 * 不应被"修正"成 0，否则会悄悄改变用户的布局意图。
 */
export function distributeInstances(
  doc: DocumentState,
  ids: readonly Id[],
  axis: DistributeAxis,
): DocumentState {
  const set = new Set(ids);
  const list = doc.instances.filter((it) => set.has(it.id));
  if (list.length < 3) return doc;

  const horizontal = axis === "horizontal";
  const pos = (f: Frame) => (horizontal ? f.x : f.y);
  const size = (f: Frame) => (horizontal ? f.w : f.h);

  const sorted = list
    .slice()
    .sort((a, b) => pos(a.frame) + size(a.frame) / 2 - (pos(b.frame) + size(b.frame) / 2));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = pos(first.frame);
  const end = pos(last.frame) + size(last.frame);
  const used = sorted.reduce((sum, it) => sum + size(it.frame), 0);
  const gap = (end - start - used) / (sorted.length - 1);

  let cursor = start;
  const changes: Array<{ id: Id; frame: Frame }> = [];
  for (const it of sorted) {
    const p = Math.round(cursor);
    const f = it.frame;
    changes.push({
      id: it.id,
      frame: horizontal ? { ...f, x: p } : { ...f, y: p },
    });
    cursor += size(f) + gap;
  }

  return applyFrames(doc, changes);
}

/**
 * 显示顺序（图层列表，顶部在上）→ 数组下标（底 → 顶）的互换。
 *
 * 图层列表必须"顶层在上"，而数组是"底 → 顶"，两者互为镜像。
 * 这个换算是列表拖拽排序最容易写错的地方（拖第 1 行却动了第 n 行），故单列并测试。
 */
export function displayIndexToArray(displayIndex: number, count: number): number {
  return count - 1 - displayIndex;
}
