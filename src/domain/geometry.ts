/**
 * 纯几何计算，无副作用、无外部依赖。
 *
 * 变换顺序固定为 crop → flip → rotate → fit → composite → clip（见 docs/ARCHITECTURE.md）。
 * 本文件负责其中 rotate 后的尺寸换算与 fit 计算。
 */

import type { FitMode, Frame, Rotation } from "./types";

/** 旋转 90/270 时宽高互换 */
export function rotateSize(w: number, h: number, rotation: Rotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h };
}

export interface FitResult {
  /** 相对目标框左上角的偏移，用于 fill 时的负值裁切或 contain 时的居中留白 */
  dx: number;
  dy: number;
  /** 缩放后的绘制尺寸 */
  w: number;
  h: number;
  /** 统一缩放比例（相对源尺寸） */
  scale: number;
}

/**
 * 把源尺寸适配进目标框。
 *
 * - `fill`：等比放大至完全覆盖目标框，超出部分裁切（不改变 crop 数据）
 * - `contain`：等比缩放至完整可见，剩余区域露出背景
 *
 * 只做计算，不回写裁剪数据：适配产生的裁切与用户裁剪是两层，混写会让切换模板后丢失用户裁剪。
 */
export function fitInto(
  srcW: number,
  srcH: number,
  dst: Pick<Frame, "w" | "h">,
  mode: FitMode,
): FitResult {
  if (srcW <= 0 || srcH <= 0 || dst.w <= 0 || dst.h <= 0) {
    return { dx: 0, dy: 0, w: 0, h: 0, scale: 0 };
  }
  const sx = dst.w / srcW;
  const sy = dst.h / srcH;
  const scale = mode === "fill" ? Math.max(sx, sy) : Math.min(sx, sy);
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    dx: (dst.w - w) / 2,
    dy: (dst.h - h) / 2,
    w,
    h,
    scale,
  };
}

/** 点是否落在矩形内（含边界） */
export function containsPoint(rect: Frame, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** 两矩形是否相交（用于创建实例时避开重叠） */
export function intersects(a: Frame, b: Frame): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 外框（帧）与内容几何一致性校验用：把实例的 frame 转成整数像素边界，避免条带接缝 */
export function snapToPixel(v: number): number {
  return Math.round(v);
}
