/**
 * 裁剪几何。
 *
 * crop 始终存源图像素坐标，与旋转无关：旋转只改显示朝向，不重写 crop。
 * 编辑器内部用归一化坐标（0~1，相对源图），界面缩放与预览分辨率不参与计算。
 *
 * 裁剪框锁定为旋转后正好等于 frame 的比例，否则用户裁完仍会被 coverCrop 二次裁切，
 * 所见非所得。取舍见 docs/adr/ADR-0006。
 */

import type { CropRect, Frame, Rotation } from "./types";

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 源图坐标系下的目标宽高比：旋转 90/270 时宽高互换，比例取倒数 */
export function cropAspectFor(frame: Pick<Frame, "w" | "h">, rotation: Rotation): number {
  const swapped = rotation === 90 || rotation === 270;
  const fw = Math.max(1e-6, frame.w);
  const fh = Math.max(1e-6, frame.h);
  return swapped ? fh / fw : fw / fh;
}

export function toNorm(rect: CropRect, source: { w: number; h: number }): NormRect {
  const sw = Math.max(1, source.w);
  const sh = Math.max(1, source.h);
  return { x: rect.x / sw, y: rect.y / sh, w: rect.w / sw, h: rect.h / sh };
}

export function toSource(rect: NormRect, source: { w: number; h: number }): CropRect {
  const sw = Math.max(1, source.w);
  const sh = Math.max(1, source.h);
  const x = Math.round(clamp(rect.x, 0, 1) * sw);
  const y = Math.round(clamp(rect.y, 0, 1) * sh);
  const w = Math.max(1, Math.round(rect.w * sw));
  const h = Math.max(1, Math.round(rect.h * sh));
  return {
    x: clamp(x, 0, sw - 1),
    y: clamp(y, 0, sh - 1),
    w: Math.min(w, sw - clamp(x, 0, sw - 1)),
    h: Math.min(h, sh - clamp(y, 0, sh - 1)),
  };
}

/** 位置夹到源图内，尺寸不变（移动裁剪框时用） */
function shiftInside(r: NormRect): NormRect {
  const w = Math.min(r.w, 1);
  const h = Math.min(r.h, 1);
  return {
    x: clamp(r.x, 0, 1 - w),
    y: clamp(r.y, 0, 1 - h),
    w,
    h,
  };
}

export function moveCrop(start: NormRect, dx: number, dy: number): NormRect {
  return shiftInside({ ...start, x: start.x + dx, y: start.y + dy });
}

/**
 * 拖动控制点改变裁剪框。
 *
 * 角点固定对角，边点固定另一轴的中线，与常见设计工具一致，
 * 避免拖动左边时整块上下跳动。
 *
 * @param px,py 指针当前位置（归一化，越界会夹回源图）
 * @param aspect 目标宽高比，取 cropAspectFor 的结果
 * @param min 最小边长（归一化），防止拖成零面积
 */
export function resizeCrop(
  start: NormRect,
  kind: CropHandle,
  px: number,
  py: number,
  aspect: number,
  min = 0.02,
): NormRect {
  const a = Math.max(1e-6, aspect);
  const left = start.x;
  const top = start.y;
  const right = start.x + start.w;
  const bottom = start.y + start.h;

  const west = kind === "w" || kind === "nw" || kind === "sw";
  const east = kind === "e" || kind === "ne" || kind === "se";
  const north = kind === "n" || kind === "nw" || kind === "ne";
  const south = kind === "s" || kind === "sw" || kind === "se";

  const X = clamp(px, 0, 1);
  const Y = clamp(py, 0, 1);

  // 角点：对角固定，取较小的那一边以贴合指针
  if ((west || east) && (north || south)) {
    const ax = west ? right : left;
    const ay = north ? bottom : top;
    const rawW = Math.abs(X - ax);
    const rawH = Math.abs(Y - ay);
    let w = Math.min(rawW, rawH * a);
    let h = w / a;
    if (w < min) {
      w = min;
      h = w / a;
    }
    const x = west ? ax - w : ax;
    const y = north ? ay - h : ay;
    return shiftInside({ x, y, w, h });
  }

  // 左右边点：垂直方向以原中线为准
  if (east || west) {
    const cy = top + start.h / 2;
    const maxH = 2 * Math.min(cy, 1 - cy);
    const maxW = Math.max(min, maxH * a);
    let w = east ? X - left : right - X;
    w = clamp(w, min, maxW);
    const h = w / a;
    const x = east ? left : right - w;
    return shiftInside({ x, y: cy - h / 2, w, h });
  }

  // 上下边点：水平方向以原中线为准
  const cx = left + start.w / 2;
  const maxW = 2 * Math.min(cx, 1 - cx);
  const maxH = Math.max(min, maxW / a);
  let h = south ? Y - top : bottom - Y;
  h = clamp(h, min, maxH);
  const w = h * a;
  const y = south ? top : bottom - h;
  return shiftInside({ x: cx - w / 2, y, w, h });
}

/**
 * 首屏裁剪框：以当前可见区域为起点，进入裁剪时框住的就是用户此刻看到的那一块。
 */
export function initialCropNorm(visible: CropRect, source: { w: number; h: number }): NormRect {
  return shiftInside(toNorm(visible, source));
}
