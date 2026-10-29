/**
 * 实例变换几何（docs/ARCHITECTURE.md §4 的唯一语义来源）。
 *
 * 绘制顺序固定：crop → flip → rotate → fit → composite → clip
 * 预览（Konva）与未来的条带导出都调用本文件，禁止各自实现一套。
 */

import type { CropRect, Frame, Rotation } from "./types";

/** 旋转 90/270 时宽高互换（已定义在 geometry.ts，这里复用以保持单一来源） */
import { rotateSize } from "./geometry";

export interface CoverCropResult {
  crop: CropRect;
  /** 未旋转坐标系下的绘制尺寸（Konna node 的 width/height） */
  drawW: number;
  drawH: number;
  /** 缩放比 = 目标框尺寸 / 旋转后内容尺寸 */
  scale: number;
}

/**
 * 计算"填满目标框"所需的裁剪。
 *
 * 关键约定：**只读 crop，不回写 crop**。
 * 适配裁切与用户裁剪是两层，混写会导致切换模板后丢失用户裁剪
 * （docs/ARCHITECTURE.md §4）。
 */
export function coverCrop(
  crop: CropRect,
  rotation: Rotation,
  frame: Pick<Frame, "w" | "h">,
): CoverCropResult {
  const swapped = rotation === 90 || rotation === 270;
  const eff = rotateSize(crop.w, crop.h, rotation); // 旋转后内容的宽高
  if (eff.w <= 0 || eff.h <= 0 || frame.w <= 0 || frame.h <= 0) {
    return { crop: { ...crop }, drawW: 0, drawH: 0, scale: 0 };
  }

  const targetAspect = frame.w / frame.h;
  const effAspect = eff.w / eff.h;

  let next: CropRect = { ...crop };

  if (effAspect > targetAspect) {
    // 内容偏宽：需要裁掉左右（旋转 90/270 时对应源图的上下）
    const newEffW = eff.h * targetAspect;
    const delta = eff.w - newEffW;
    next = swapped
      ? { ...next, y: next.y + delta / 2, h: Math.max(1, next.h - delta) }
      : { ...next, x: next.x + delta / 2, w: Math.max(1, next.w - delta) };
  } else if (effAspect < targetAspect) {
    // 内容偏高：需要裁掉上下（旋转 90/270 时对应源图的左右）
    const newEffH = eff.w / targetAspect;
    const delta = eff.h - newEffH;
    next = swapped
      ? { ...next, x: next.x + delta / 2, w: Math.max(1, next.w - delta) }
      : { ...next, y: next.y + delta / 2, h: Math.max(1, next.h - delta) };
  }

  const effAfter = rotateSize(next.w, next.h, rotation);
  const scale = frame.w / effAfter.w; // 此时 effAfter 比例已等于 frame 比例

  return {
    crop: next,
    drawW: next.w * scale,
    drawH: next.h * scale,
    scale,
  };
}

/**
 * 实例在画布坐标系中的中心点。
 * Konva 用 offset 把节点锚点移到中心，因此旋转围绕 frame 中心进行，
 * 与 ARCHITECTURE.md §4「frame 是轴对齐显示框，旋转只作用于内容」一致。
 */
export function frameCenter(frame: Frame): { cx: number; cy: number } {
  return { cx: frame.x + frame.w / 2, cy: frame.y + frame.h / 2 };
}

/** 把矩形对齐到整数像素，避免条带渲染出现半像素接缝 */
export function alignFrame(frame: Frame): Frame {
  return {
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    w: Math.round(frame.w),
    h: Math.round(frame.h),
  };
}
