/**
 * 画布边界与内容溢出。
 *
 * 边界外内容在预览与导出中同样被裁切，工具既不自动扩张画布，也不自动挪动越界图片。
 * 这里只做检测与报告，任何修正都必须由用户操作产生。
 */

import type { Background, DocumentState, Frame, Id } from "./types";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 所有实例外框的并集；无实例返回 null */
export function contentBounds(doc: DocumentState): Bounds | null {
  if (doc.instances.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of doc.instances) {
    const f = it.frame;
    minX = Math.min(minX, f.x);
    minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.w);
    maxY = Math.max(maxY, f.y + f.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** 实例是否越出画布边界（贴边不算越界） */
export function isOverflowing(doc: DocumentState, frame: Frame): boolean {
  const c = doc.canvas;
  return frame.x < 0 || frame.y < 0 || frame.x + frame.w > c.width || frame.y + frame.h > c.height;
}

/** 越界实例 id 列表（按图层顺序，底 → 顶） */
export function overflowingIds(doc: DocumentState): Id[] {
  return doc.instances.filter((it) => isOverflowing(doc, it.frame)).map((it) => it.id);
}

export interface OverflowReport {
  count: number;
  ids: Id[];
  /** 四个方向各自的溢出像素（取所有实例的最大值，0 表示该方向无溢出） */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function overflowReport(doc: DocumentState): OverflowReport {
  const ids: Id[] = [];
  let left = 0;
  let top = 0;
  let right = 0;
  let bottom = 0;
  const c = doc.canvas;

  for (const it of doc.instances) {
    const f = it.frame;
    const l = Math.max(0, -f.x);
    const t = Math.max(0, -f.y);
    const r = Math.max(0, f.x + f.w - c.width);
    const b = Math.max(0, f.y + f.h - c.height);
    if (l > 0 || t > 0 || r > 0 || b > 0) {
      ids.push(it.id);
      left = Math.max(left, l);
      top = Math.max(top, t);
      right = Math.max(right, r);
      bottom = Math.max(bottom, b);
    }
  }

  return { count: ids.length, ids, left, top, right, bottom };
}

/** 渐变角度归一到 [0, 360)，负值与 >360 都折回同一方向 */
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return ((angle % 360) + 360) % 360;
}

/** 常用画布尺寸预设（默认 2400×1600，其余为便捷项） */
export const CANVAS_PRESETS: Array<{ label: string; width: number; height: number }> = [
  { label: "横图 3:2", width: 2400, height: 1600 },
  { label: "方图 1:1", width: 2000, height: 2000 },
  { label: "竖图 3:4", width: 1800, height: 2400 },
  { label: "手机 9:16", width: 1080, height: 1920 },
];

/** 背景是否会在导出时参与合成（透明背景在 JPG 下会被填成白色，提示用） */
export function isTransparentBackground(bg: Background): boolean {
  return bg.type === "transparent";
}

export const DEFAULT_GRADIENT = { from: "#ffffff", to: "#dfe7f5", angle: 90 } as const;
