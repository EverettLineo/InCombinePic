/**
 * 领域模型（对应需求基线 §4.2 的四类概念）
 *
 * 硬约束（见 docs/ARCHITECTURE.md §1）：
 * 本文件及其所在 domain 目录 **不得** import React / Konva / @tauri-apps。
 * 该约束由 eslint.config.js 在构建期强制。
 */

export type Id = string;

/** 概念 1：资源库条目。同一物理路径可存在多条，互不影响 */
export interface LibraryItem {
  id: Id;
  /** 仅用于"同路径判重"（基线 §6.4 明确不做内容哈希） */
  sourcePath: string;
  fileName: string;
  /** 导入序号：同名文件的稳定次级排序依据，避免顺序无故跳动 */
  importSeq: number;
  /** epoch 毫秒 */
  importedAt: number;
  /** 已应用 EXIF Orientation 后的显示尺寸 */
  width: number;
  height: number;
  format: ImageFormat;
  hasAlpha: boolean;
  /** 源文件字节数，用于列表展示与导入风险提示 */
  fileSize: number;
}

export type ImageFormat = "png" | "jpeg" | "webp" | "bmp";

/** 源像素坐标下的矩形 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 画布坐标系下的轴对齐矩形 */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 概念 2：画布图片实例。同一资源可被多次放置，各自独立 */
export interface CanvasInstance {
  id: Id;
  libraryItemId: Id;
  /** 模板切换时"复用最早创建实例"的判定依据（基线 §9.4 第 3 条） */
  createdSeq: number;
  frame: Frame;
  /** 非破坏性裁剪，永远相对源图像素，不随旋转改变 */
  crop: CropRect;
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
  /** 0..1，对应界面上的 0~100% */
  opacity: number;
  border: Border;
  cornerRadius: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface Border {
  width: number;
  color: string;
}

/** 概念 3：画布文档状态。撤销/重做的作用对象 */
export interface DocumentState {
  canvas: CanvasSpec;
  /** 数组顺序即图层顺序（底 → 顶） */
  instances: CanvasInstance[];
  templateId: string | null;
  /** 统一间距；无缝模式恒为 0 */
  gap: number;
  fitMode: FitMode;
}

export interface CanvasSpec {
  width: number;
  height: number;
  background: Background;
}

export type FitMode = "fill" | "contain";

export type Background =
  | { type: "white" }
  | { type: "transparent" }
  | { type: "solid"; color: string }
  | { type: "linear"; from: string; to: string; angle: number };

/** 概念 4：视图状态。不入撤销历史、不持久化、不影响导出像素 */
export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  selection: Id[];
}

/** 默认画布：2400×1600（基线 §5.3 推荐值，已采纳，见 task.md D-03） */
export const DEFAULT_CANVAS: CanvasSpec = {
  width: 2400,
  height: 1600,
  background: { type: "white" },
};

export function createEmptyDocument(): DocumentState {
  return {
    canvas: { ...DEFAULT_CANVAS },
    instances: [],
    templateId: null,
    gap: 0,
    fitMode: "fill",
  };
}
