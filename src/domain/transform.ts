/**
 * 实例变换几何的唯一实现。
 *
 * 绘制顺序固定为 crop → flip → rotate → fit → composite → clip，
 * 预览与导出共用本文件，不得各自实现一套。
 */

import type { CropRect, Frame, Rotation } from "./types";

/** 旋转 90/270 时宽高互换（已定义在 geometry.ts，这里复用以保持单一来源） */
import { rotateSize } from "./geometry";

export interface CoverCropResult {
  crop: CropRect;
  /** 未旋转坐标系下的绘制尺寸（Konva 节点的 width / height） */
  drawW: number;
  drawH: number;
  /** 缩放比 = 目标框尺寸 / 旋转后内容尺寸 */
  scale: number;
}

/**
 * 计算填满目标框所需的裁剪。
 *
 * 只读 crop，不回写：适配裁切与用户裁剪是两层数据，混写会让切换模板后丢失用户裁剪。
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
 * 完整显示适配：不裁切，等比缩放到框内，剩余部分露出画布背景。
 *
 * 与 coverCrop 的差别只在缩放比取 min 而非 max，且完全不改 crop。
 */
export function containCrop(
  crop: CropRect,
  rotation: Rotation,
  frame: Pick<Frame, "w" | "h">,
): CoverCropResult {
  const eff = rotateSize(crop.w, crop.h, rotation);
  if (eff.w <= 0 || eff.h <= 0 || frame.w <= 0 || frame.h <= 0) {
    return { crop: { ...crop }, drawW: 0, drawH: 0, scale: 0 };
  }
  const scale = Math.min(frame.w / eff.w, frame.h / eff.h);
  return {
    crop: { ...crop },
    drawW: crop.w * scale,
    drawH: crop.h * scale,
    scale,
  };
}

/**
 * 把源图像素裁剪换算为已加载位图的坐标。
 *
 * 预览位图按最长边 2048 降采样，crop 存的却是源图像素。
 * 直接使用会让 Konva 采样到图像之外，表现为大图空白或错位。
 */
export function toImageCrop(crop: CropRect, pixelScale: number): CropRect {
  const s = pixelScale > 0 && Number.isFinite(pixelScale) ? pixelScale : 1;
  return { x: crop.x * s, y: crop.y * s, w: crop.w * s, h: crop.h * s };
}

/**
 * 实例在画布坐标系中的中心点。
 *
 * Konva 通过 offset 把节点锚点移到中心，旋转因此围绕 frame 中心进行，
 * 与「frame 是轴对齐显示框、旋转只作用于内容」的约定一致。
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

/** 八个控制点方位 */
export type HandleKind = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface HandlePoint {
  kind: HandleKind;
  x: number;
  y: number;
}

/** 控制点坐标（画布坐标）。绘制与命中判定共用，避免两处算错 */
export function handlePoints(frame: Frame): HandlePoint[] {
  const { x, y, w, h } = frame;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return [
    { kind: "nw", x, y },
    { kind: "n", x: cx, y },
    { kind: "ne", x: x + w, y },
    { kind: "e", x: x + w, y: cy },
    { kind: "se", x: x + w, y: y + h },
    { kind: "s", x: cx, y: y + h },
    { kind: "sw", x, y: y + h },
    { kind: "w", x, y: cy },
  ];
}

/**
 * 按控制点拖动量计算新的外框。
 *
 * 对边固定（拖左边则右边不动），最小尺寸受 `min` 限制，
 * 避免拖成零面积导致 coverCrop 除零。
 */
export function applyResize(
  frame: Frame,
  kind: HandleKind,
  dx: number,
  dy: number,
  min = 8,
): Frame {
  let { x, y, w, h } = frame;
  const left = frame.x;
  const top = frame.y;
  const right = frame.x + frame.w;
  const bottom = frame.y + frame.h;

  const west = kind === "w" || kind === "nw" || kind === "sw";
  const east = kind === "e" || kind === "ne" || kind === "se";
  const north = kind === "n" || kind === "nw" || kind === "ne";
  const south = kind === "s" || kind === "sw" || kind === "se";

  if (east) {
    w = Math.max(min, w + dx);
  } else if (west) {
    // 右边固定：新宽度 = 右边 - 新左边，且不小于最小尺寸
    const nx = Math.min(right - min, left + dx);
    w = right - nx;
    x = nx;
  }

  if (south) {
    h = Math.max(min, h + dy);
  } else if (north) {
    const ny = Math.min(bottom - min, top + dy);
    h = bottom - ny;
    y = ny;
  }

  return { x, y, w, h };
}

/** 不同控制点对应的鼠标指针样式 */
export function cursorForHandle(kind: HandleKind): string {
  switch (kind) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    default:
      return "ew-resize";
  }
}
