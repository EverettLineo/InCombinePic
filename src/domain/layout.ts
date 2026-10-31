/**
 * 布局算法（纯函数，无副作用）。
 *
 * T5.1 初始布局与 T5.2 单张放置都从这里取几何，
 * 保证"首次排布"和"后来添加"用的是同一套可预测规则（基线 §7.1、§7.2）。
 */

import { clamp } from "./document";
import type { Frame } from "./types";

export interface Box {
  width: number;
  height: number;
}

/** 等比缩放并居中到画布，用于单张放置 */
export function centerFitFrame(
  item: Box,
  canvas: Box,
  options: { maxRatio?: number; gap?: number } = {},
): Frame {
  const maxRatio = options.maxRatio ?? 0.6;
  const gap = options.gap ?? 0;
  if (item.width <= 0 || item.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  const maxW = canvas.width * maxRatio - gap * 2;
  const maxH = canvas.height * maxRatio - gap * 2;
  const scale = Math.min(maxW / item.width, maxH / item.height);
  const w = Math.max(1, Math.round(item.width * scale));
  const h = Math.max(1, Math.round(item.height * scale));

  return {
    x: Math.round((canvas.width - w) / 2),
    y: Math.round((canvas.height - h) / 2),
    w,
    h,
  };
}

/**
 * 初始网格布局：按给定顺序把图片排进画布，尽量完整可见且不重叠（基线 §7.1）。
 *
 * 算法固定，不引入随机，保证同样输入永远得到同样结果——否则用户每次
 * 重新排布都会看到不同结果，无法预期。
 */
export function gridFrames(
  items: Box[],
  canvas: Box,
  gap: number,
  padding = 0,
): Frame[] {
  const count = items.length;
  if (count === 0) return [];
  if (canvas.width <= 0 || canvas.height <= 0) return items.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));

  // 选列数使格子最接近正方形
  let bestCols = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellW = (canvas.width - padding * 2 - gap * (cols - 1)) / cols;
    const cellH = (canvas.height - padding * 2 - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) continue;
    const score = Math.abs(Math.log(cellW / cellH));
    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }

  const cols = bestCols;
  const rows = Math.ceil(count / cols);
  const cellW = (canvas.width - padding * 2 - gap * (cols - 1)) / cols;
  const cellH = (canvas.height - padding * 2 - gap * (rows - 1)) / rows;

  return items.map((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = padding + col * (cellW + gap);
    const cellY = padding + row * (cellH + gap);

    // 在单元格内等比缩放居中，留出边距让图片之间有呼吸感
    const innerGap = Math.min(12, cellW * 0.06, cellH * 0.06);
    const availW = Math.max(1, cellW - innerGap * 2);
    const availH = Math.max(1, cellH - innerGap * 2);
    const scale = Math.min(availW / it.width, availH / it.height);
    const w = Math.max(1, Math.round(it.width * scale));
    const h = Math.max(1, Math.round(it.height * scale));

    return {
      x: Math.round(cellX + (cellW - w) / 2),
      y: Math.round(cellY + (cellH - h) / 2),
      w,
      h,
    };
  });
}

/**
 * 级联放置：已有内容时，把新图缩小并按固定步长错开，直到不与已有实例大面积重叠。
 *
 * 为什么需要：原来的"居中适配"在画布已有内容时会把新图**完全盖在旧图下面**，
 * 用户双击后看不到任何变化，会认为双击失效（2026-10-31 反馈）。
 *
 * 判定用"重叠面积 / 较小者面积"，而不是绝对面积：一张大图和一张小图重叠 5% 与
 * 两张小图重叠 5% 的观感差别很大，比值才稳定。
 */
export function cascadeFrame(
  size: { width: number; height: number },
  canvas: { width: number; height: number },
  existing: readonly Frame[],
  opts: { scale?: number; step?: number; maxTries?: number; maxOverlap?: number } = {},
): Frame {
  const scale = opts.scale ?? 0.7;
  const step = opts.step ?? 32;
  const maxTries = opts.maxTries ?? 24;
  const maxOverlap = opts.maxOverlap ?? 0.15;

  const base = centerFitFrame(size, canvas);
  if (base.w <= 0 || base.h <= 0) return base;
  // 空画布就该铺满：缩小与错开只在"已经有内容"时才有意义
  if (existing.length === 0) return base;

  const w = Math.max(8, Math.round(base.w * scale));
  const h = Math.max(8, Math.round(base.h * scale));
  const startX = Math.round((canvas.width - w) / 2);
  const startY = Math.round((canvas.height - h) / 2);

  let best: Frame = { x: startX, y: startY, w, h };
  let bestRatio = Infinity;

  for (let i = 0; i < maxTries; i++) {
    // 斜向右下错开；每一步都夹回画布内，避免跑到边界外
    const x = clamp(startX + i * step, 0, Math.max(0, canvas.width - w));
    const y = clamp(startY + i * step, 0, Math.max(0, canvas.height - h));
    const f: Frame = { x, y, w, h };

    let worst = 0;
    for (const e of existing) {
      const ow = Math.min(f.x + f.w, e.x + e.w) - Math.max(f.x, e.x);
      const oh = Math.min(f.y + f.h, e.y + e.h) - Math.max(f.y, e.y);
      if (ow <= 0 || oh <= 0) continue;
      const ratio = (ow * oh) / Math.min(f.w * f.h, Math.max(1, e.w * e.h));
      worst = Math.max(worst, ratio);
    }
    if (worst < bestRatio) {
      bestRatio = worst;
      best = f;
    }
    if (worst <= maxOverlap) return f;
  }
  return best;
}
