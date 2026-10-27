/**
 * 文档状态的纯函数操作集。
 *
 * 设计约束（docs/ARCHITECTURE.md §8）：
 * 所有文档变更都必须表现为 `DocumentState -> DocumentState` 的纯函数，
 * 不得就地修改、不得有副作用。理由：撤销/重做需要状态可深比较、可快照，
 * 而不是回放命令（模板切换这类跨多对象操作回放极易不一致）。
 *
 * 本文件不依赖 React / Konva / IPC，可 100% 单测。
 */

import type {
  Background,
  CanvasInstance,
  CanvasSpec,
  CropRect,
  DocumentState,
  FitMode,
  Frame,
  Id,
  Rotation,
} from "./types";

/** 新建实例时的默认属性：无边框、无圆角、不透明（基线 §8.8） */
export const DEFAULT_BORDER = { width: 0, color: "#000000" } as const;

export function fullCrop(width: number, height: number): CropRect {
  return { x: 0, y: 0, w: width, h: height };
}

/** createdSeq 单调递增，用于模板切换时"复用最早创建的实例"（基线 §9.4 第 3 条） */
export function nextCreatedSeq(doc: DocumentState): number {
  return doc.instances.reduce((max, it) => Math.max(max, it.createdSeq), -1) + 1;
}

export interface CreateInstanceInput {
  id: Id;
  libraryItemId: Id;
  /** 源图显示尺寸（已应用 EXIF 方向），用于初始化 crop */
  sourceWidth: number;
  sourceHeight: number;
  frame: Frame;
}

export function createInstance(doc: DocumentState, input: CreateInstanceInput): CanvasInstance {
  return {
    id: input.id,
    libraryItemId: input.libraryItemId,
    createdSeq: nextCreatedSeq(doc),
    frame: { ...input.frame },
    crop: fullCrop(input.sourceWidth, input.sourceHeight),
    rotation: 0,
    flipH: false,
    flipV: false,
    opacity: 1,
    border: { ...DEFAULT_BORDER },
    cornerRadius: 0,
  };
}

/** 追加到顶层（数组顺序 = 图层顺序，底 → 顶） */
export function addInstance(doc: DocumentState, instance: CanvasInstance): DocumentState {
  return { ...doc, instances: [...doc.instances, instance] };
}

export function addInstances(doc: DocumentState, list: readonly CanvasInstance[]): DocumentState {
  if (list.length === 0) return doc;
  return { ...doc, instances: [...doc.instances, ...list] };
}

export function removeInstances(doc: DocumentState, ids: readonly Id[]): DocumentState {
  const drop = new Set(ids);
  const next = doc.instances.filter((it) => !drop.has(it.id));
  // 引用未变则返回原对象，便于上层做廉价相等判断
  return next.length === doc.instances.length ? doc : { ...doc, instances: next };
}

/** 释放资源库条目时级联移除其全部实例（基线 §6.6） */
export function removeInstancesByLibraryItem(
  doc: DocumentState,
  libraryItemIds: readonly Id[],
): DocumentState {
  const drop = new Set(libraryItemIds);
  const next = doc.instances.filter((it) => !drop.has(it.libraryItemId));
  return next.length === doc.instances.length ? doc : { ...doc, instances: next };
}

export function updateInstance(
  doc: DocumentState,
  id: Id,
  patch: Partial<Omit<CanvasInstance, "id">>,
): DocumentState {
  let changed = false;
  const next = doc.instances.map((it) => {
    if (it.id !== id) return it;
    changed = true;
    return { ...it, ...patch };
  });
  return changed ? { ...doc, instances: next } : doc;
}

/** 图层顺序调整：数组内移动（基线 §8.6，不做独立的置顶/置底按钮） */
export function reorderInstance(doc: DocumentState, from: number, to: number): DocumentState {
  const n = doc.instances.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return doc;
  const next = doc.instances.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...doc, instances: next };
}

export function setCanvasSize(doc: DocumentState, width: number, height: number): DocumentState {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (doc.canvas.width === w && doc.canvas.height === h) return doc;
  // 只改边界，不移动/缩放既有实例（基线 §5.3）
  return { ...doc, canvas: { ...doc.canvas, width: w, height: h } };
}

export function setBackground(doc: DocumentState, background: Background): DocumentState {
  return { ...doc, canvas: { ...doc.canvas, background } };
}

export function setGap(doc: DocumentState, gap: number): DocumentState {
  const g = Math.max(0, gap);
  return doc.gap === g ? doc : { ...doc, gap: g };
}

export function setFitMode(doc: DocumentState, fitMode: FitMode): DocumentState {
  return doc.fitMode === fitMode ? doc : { ...doc, fitMode };
}

export function setTemplate(doc: DocumentState, templateId: string | null): DocumentState {
  return doc.templateId === templateId ? doc : { ...doc, templateId };
}

/** 旋转只改内容朝向，不改变 frame（docs/ARCHITECTURE.md §4） */
export function rotateInstance(doc: DocumentState, id: Id, step: 90 | -90): DocumentState {
  const it = doc.instances.find((i) => i.id === id);
  if (!it) return doc;
  const next = (((it.rotation + step) % 360) + 360) % 360;
  return updateInstance(doc, id, { rotation: next as Rotation });
}

/** 裁剪必须始终落在源图范围内，且不可退化为零面积 */
export function setCrop(doc: DocumentState, id: Id, crop: CropRect, source: { w: number; h: number }): DocumentState {
  // 注意：上限取 source-1，否则 x 顶到 source.w 时 clamp(min=1, max=0) 会失效，
  // 产出零面积裁剪 —— 该边界由单测覆盖。
  const x = clamp(crop.x, 0, Math.max(0, source.w - 1));
  const y = clamp(crop.y, 0, Math.max(0, source.h - 1));
  const w = clamp(crop.w, 1, Math.max(1, source.w - x));
  const h = clamp(crop.h, 1, Math.max(1, source.h - y));
  return updateInstance(doc, id, { crop: { x, y, w, h } });
}

export function setCanvasSpec(doc: DocumentState, spec: CanvasSpec): DocumentState {
  return { ...doc, canvas: spec };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 资源库 → 画布实例的 id 生成（时间戳 + 序号，避免碰撞且可读） */
export function makeInstanceId(seq: number): Id {
  return `inst_${seq.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 供上层判断"是否还有实例引用该资源"（释放资源前的提示与校验） */
export function instanceCountByLibraryItem(doc: DocumentState, libraryItemId: Id): number {
  return doc.instances.filter((it) => it.libraryItemId === libraryItemId).length;
}

/** 会话内是否存在"有内容"的文档（用于退出保护判据，基线 §13.1） */
export function hasContent(doc: DocumentState): boolean {
  return doc.instances.length > 0;
}
