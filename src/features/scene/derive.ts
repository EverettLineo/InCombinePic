/**
 * 文档状态 → 场景描述（纯函数，不接触 Konva）。
 *
 * 分层理由：
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
  /** 全局适配模式：fill 裁切填满，contain 完整显示 */
  fitMode: FitMode;
  /**
   * 模板模式下该实例所属的单元格（画布坐标）。
   *
   * 渲染层据此把实例裁进单元格：否则放大/拖动的图片会盖住相邻格，
   * 用户看到的是"图压到别人身上"。
   */
  cell?: Frame;
  /** 图像尚未加载完成时为 undefined，渲染层应跳过该节点而不是画错位置 */
  source?: SceneImage;
}

export interface SceneDescriptor {
  canvas: CanvasSpec;
  /** 顺序即堆叠顺序（底 → 顶） */
  nodes: SceneNode[];
  /** 有多少实例因为图像未就绪而暂不渲染 */
  pendingCount: number;
  /**
   * 当前模板的空白单元格（含模板内下标与填充序号）。
   *
   * 序号从 1 开始按格子编号升序排列，用户看到的「1/2/3」就是双击时依次填入的顺序。
   */
  emptyCells: Array<{ index: number; frame: Frame; order: number }>;
}

export function deriveScene(doc: DocumentState, sources: SceneSources): SceneDescriptor {
  const template = findTemplate(doc.templateId);
  const cellFrames = template ? templateFrames(template, doc.canvas, doc.gap) : [];

  /** 按实例中心判定所属单元格；中心不在任何格内则视为"已移出模板" */
  function cellOf(frame: Frame): Frame | undefined {
    if (cellFrames.length === 0) return undefined;
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    return cellFrames.find(
      (f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h,
    );
  }

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
      cell: cellOf(it.frame),
      source,
    };
  });

  const emptyCells = template
    ? (() => {
        const frames = templateFrames(template, doc.canvas, doc.gap);
        return emptyCellIndices(doc, template).map((i, order) => ({
          index: i,
          frame: frames[i],
          order: order + 1,
        }));
      })()
    : [];

  return { canvas: doc.canvas, nodes, pendingCount, emptyCells };
}
