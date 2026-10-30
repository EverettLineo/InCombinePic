import { create } from "zustand";
import { clamp } from "../domain/document";
import type { Id, ViewState } from "../domain/types";

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/**
 * 视图域 store —— 缩放、平移、选中。
 *
 * 硬约束（基线 §4.2、§5.3）：
 * 视图状态**不进入撤销历史、不持久化、不影响导出像素尺寸**。
 * 因此本 store 与 docStore 完全隔离，任何"选中变化"都不应产生撤销记录。
 */
/** 选图弹窗的两个用途：填入模板空格 / 替换已有实例的图片 */
export type PickerTarget =
  | { kind: "cell"; cellIndex: number }
  | { kind: "replace"; instanceId: Id };

export interface ViewStore extends ViewState {
  /** 正在裁剪的实例 id；null 表示未进入裁剪。属于界面状态，不入历史、不持久化 */
  cropEditor: Id | null;
  openCropEditor: (id: Id) => void;
  closeCropEditor: () => void;
  /** 导出面板是否打开 */
  exportOpen: boolean;
  openExport: () => void;
  closeExport: () => void;
  /** 选图弹窗的目标；null 表示未打开。纯界面状态 */
  picker: PickerTarget | null;
  openCellPicker: (cellIndex: number) => void;
  openReplacePicker: (instanceId: Id) => void;
  closePicker: () => void;
  setZoom: (zoom: number) => void;
  /** 以视口内某点为锚缩放（滚轮缩放用，锚点下的内容保持不动） */
  zoomAt: (factor: number, anchorX: number, anchorY: number) => void;
  setPan: (panX: number, panY: number) => void;
  panBy: (dx: number, dy: number) => void;
  /** 适应画布：把 w×h 的内容完整放进 vw×vh 视口并居中 */
  fitToViewport: (w: number, h: number, vw: number, vh: number) => void;
  setSelection: (ids: readonly Id[]) => void;
  /** Ctrl/Shift 多选：已选中则移除，否则追加 */
  toggleSelection: (id: Id) => void;
  clearSelection: () => void;
  resetView: () => void;
}

const initial: ViewState = { zoom: 1, panX: 0, panY: 0, selection: [] };

export const useViewStore = create<ViewStore>((set, get) => ({
  ...initial,
  cropEditor: null,
  picker: null,
  exportOpen: false,

  openCropEditor: (id) => set({ cropEditor: id }),
  closeCropEditor: () => set({ cropEditor: null }),
  openCellPicker: (cellIndex) => set({ picker: { kind: "cell", cellIndex } }),
  openReplacePicker: (instanceId) => set({ picker: { kind: "replace", instanceId } }),
  closePicker: () => set({ picker: null }),
  openExport: () => set({ exportOpen: true }),
  closeExport: () => set({ exportOpen: false }),

  setZoom: (zoom) => set({ zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) }),

  zoomAt: (factor, anchorX, anchorY) => {
    const { zoom, panX, panY } = get();
    const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === zoom) return;
    const k = next / zoom;
    // 保持锚点在内容坐标系中的位置不变
    set({
      zoom: next,
      panX: anchorX - (anchorX - panX) * k,
      panY: anchorY - (anchorY - panY) * k,
    });
  },

  setPan: (panX, panY) => set({ panX, panY }),

  panBy: (dx, dy) => set((s) => ({ panX: s.panX + dx, panY: s.panY + dy })),

  fitToViewport: (w, h, vw, vh) => {
    if (w <= 0 || h <= 0 || vw <= 0 || vh <= 0) return;
    // 留 24px 边距，避免画布贴边
    const margin = 24;
    const zoom = clamp(
      Math.min((vw - margin * 2) / w, (vh - margin * 2) / h),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    set({
      zoom,
      panX: (vw - w * zoom) / 2,
      panY: (vh - h * zoom) / 2,
    });
  },

  setSelection: (ids) => set({ selection: ids.slice() }),

  toggleSelection: (id) =>
    set((s) =>
      s.selection.includes(id)
        ? { selection: s.selection.filter((x) => x !== id) }
        : { selection: [...s.selection, id] },
    ),

  clearSelection: () => set({ selection: [] }),

  resetView: () => set({ ...initial }),
}));
