/**
 * 文档状态 → 场景描述（纯函数，不接触 Konva）。
 *
 * 分层理由（docs/ARCHITECTURE.md §1 规则 2）：
 * 只有 features/scene 下的适配层可以 import Konva；本文件保持纯净，
 * 便于单测，也便于将来换渲染引擎时只改适配层。
 */

import { emptyCellIndices, findTemplate, templateFrames } from "../../domain/templates";
import type { CanvasSpec, DocumentState, FitMode, Frame, Id } from "../../domain/types";

/** 已加载到内存的图像源（HTMLImageElement 等，由调用方提供） */
export interface SceneImage {
  image: CanvasImageSource;
  /** 位图自身的像素尺寸（可能是降采样后的预览图） */
  width: number;
  height: number;
  /** 位图像素 / 源图像素。用于把 crop 映射到真实位图坐标 */
  pixelScale: number;
}

export type SceneSources = Record<Id, SceneImage | undefined>;

export interface SceneNode {
  id: Id;
  libraryItemId: Id;
  frame: { x: number; y: number; w: number; h: number };
  crop: { x: number; y: number; w: number; h: number };
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  opacity: number;
  border: { width: number; color: string };
  cornerRadius: number;
  /** 全局适配模式：fill 裁切填满，contain 完整显示（T8.7） */
  fitMode: FitMode;
  /** 图像尚未加载完成时为 undefined，渲染层应跳过该节点而不是画错位置 */
  source?: SceneImage;
}

export interface SceneDescriptor {
  canvas: CanvasSpec;
  /** 顺序即堆叠顺序（底 → 顶） */
  nodes: SceneNode[];
  /** 有多少实例因为图像未就绪而暂不渲染 */
  pendingCount: number;
  /** 当前模板的空白单元格（含模板内下标）：用于占位绘制与点击填空（T8.4/T8.5） */
  emptyCells: Array<{ index: number; frame: Frame }>;
}

export function deriveScene(doc: DocumentState, sources: SceneSources): SceneDescriptor {
  let pendingCount = 0;
  const nodes: SceneNode[] = doc.instances.map((it) => {
    const source = sources[it.libraryItemId];
    if (!source) pendingCount += 1;
    return {
      id: it.id,
      libraryItemId: it.libraryItemId,
      frame: it.frame,
      crop: it.crop,
      rotation: it.rotation,
      flipH: it.flipH,
      flipV: it.flipV,
      opacity: it.opacity,
      border: it.border,
      cornerRadius: it.cornerRadius,
      fitMode: doc.fitMode,
      source,
    };
  });

  const template = findTemplate(doc.templateId);
  const emptyCells = template
    ? (() => {
        const frames = templateFrames(template, doc.canvas, doc.gap);
        return emptyCellIndices(doc, template).map((i) => ({ index: i, frame: frames[i] }));
      })()
    : [];

  return { canvas: doc.canvas, nodes, pendingCount, emptyCells };
}
