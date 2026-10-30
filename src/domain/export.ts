/**
 * 导出参数的纯逻辑（T10.1 / T10.3~T10.5）。
 *
 * 与渲染无关的部分全部放这里：尺寸校验、默认文件名、条带切分。
 * 条带切分必须可测——它是"成图上会不会出现一条缝"的唯一来源。
 */

import type { CanvasSpec } from "./types";

export type ExportFormat = "png" | "jpeg";

export const MAX_EXPORT_EDGE = 20000;
/** 条带高度（基线 T10.2 指定 2048） */
export const STRIP_H = 2048;
/** 条带之间重叠 1px，避免边界采样产生接缝（P10.2 的既定做法） */
export const STRIP_OVERLAP = 1;

export const JPEG_QUALITY_MIN = 60;
export const JPEG_QUALITY_MAX = 100;
export const JPEG_QUALITY_DEFAULT = 92;

/** 512 MB：超过这个量级的 RGBA 缓冲已经不值得冒险，宁可让用户降尺寸 */
export const MAX_RGBA_BYTES = 512 * 1024 * 1024;

export interface Strip {
  index: number;
  /** 在输出图中的起始行 */
  rowStart: number;
  /** 实际写入的行数 */
  rows: number;
  /** 实际渲染的行数（含 1px 重叠；不超过画布剩余高度） */
  renderRows: number;
}

/**
 * 把输出高度切分为条带。
 *
 * 每一条多渲染 1 行（重叠），但只写入 `rows` 行——重叠部分仅用于相邻条带的
 * 采样过渡，写进去会造成 1px 重复。
 */
export function planStrips(totalHeight: number, stripH = STRIP_H): Strip[] {
  if (!Number.isFinite(totalHeight) || totalHeight <= 0) return [];
  const h = Math.floor(totalHeight);
  const size = Math.max(1, Math.floor(stripH));
  const out: Strip[] = [];
  for (let rowStart = 0, index = 0; rowStart < h; rowStart += size, index++) {
    const rows = Math.min(size, h - rowStart);
    const renderRows = Math.min(rows + STRIP_OVERLAP, h - rowStart);
    out.push({ index, rowStart, rows, renderRows });
  }
  return out;
}

/** 导出尺寸校验：返回中文错误文案，合法时返回 null */
export function validateExportSize(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "宽高必须是数字";
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 1 || h < 1) return "宽高至少为 1 像素";
  if (w > MAX_EXPORT_EDGE || h > MAX_EXPORT_EDGE) {
    return `单边上限为 ${MAX_EXPORT_EDGE} px（当前 ${w} × ${h}）。超过该尺寸的图像在多数设备上会因内存不足而失败`;
  }
  if (w * h * 4 > MAX_RGBA_BYTES) {
    const mp = ((w * h) / 1_000_000).toFixed(1);
    return `输出尺寸 ${w} × ${h}（约 ${mp} 百万像素）超出安全内存范围，请降低尺寸后重试`;
  }
  return null;
}

/** 保持宽高比的联动计算：给定宽度算高度（取整，最小 1） */
export function heightForWidth(width: number, canvas: CanvasSpec): number {
  const ratio = canvas.height / canvas.width;
  return Math.max(1, Math.round(width * ratio));
}

export function widthForHeight(height: number, canvas: CanvasSpec): number {
  const ratio = canvas.width / canvas.height;
  return Math.max(1, Math.round(height * ratio));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 默认文件名：拼图_YYYYMMDD_HHMMSS.ext（基线 §12.1） */
export function defaultExportName(format: ExportFormat, now = new Date()): string {
  const stamp =
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const ext = format === "png" ? "png" : "jpg";
  return `拼图_${stamp}.${ext}`;
}

/** 扩展名必须与格式一致：用户改文件名时也强制纠正 */
export function ensureExtension(name: string, format: ExportFormat): string {
  const ext = format === "png" ? "png" : "jpg";
  const base = name.replace(/\.(png|jpe?g)$/i, "");
  return `${base}.${ext}`;
}

/** 导出前的透明说明（基线 §12.3：必须向用户讲清目标格式如何处理透明） */
export function transparencyNote(
  format: ExportFormat,
  backgroundType: CanvasSpec["background"]["type"],
): string {
  if (format === "png") {
    return backgroundType === "transparent"
      ? "PNG 会保留透明背景（棋盘格不会被导出）"
      : "PNG 无损输出，背景按画布设置绘制";
  }
  return backgroundType === "transparent"
    ? "JPEG 不支持透明，透明区域将用白色合成"
    : "JPEG 为有损格式，背景按画布设置绘制";
}

/** 体积估算（仅用于提示"可能较大"，不是精确预测） */
export function estimateBytes(width: number, height: number, format: ExportFormat): number {
  const px = width * height;
  return format === "png" ? px * 2 : Math.round(px * 0.35);
}
