import { create } from "zustand";
import type { ExportFinishResult } from "../platform/ipc";
import type { AppErrorPayload } from "../platform/ipc";

export type ExportStatus = "idle" | "running" | "done" | "error";

/**
 * 导出任务状态。
 *
 * 与 docStore 完全隔离：导出过程不得修改文档，失败也不得清除编辑状态
 * 。这里只放"任务进度与结果"。
 */
export interface ExportStore {
  status: ExportStatus;
  /** 已完成条带数 */
  doneStrips: number;
  totalStrips: number;
  error: AppErrorPayload | null;
  result: ExportFinishResult | null;
  /** 用户请求取消：由流程在条带之间检查 */
  cancelRequested: boolean;

  begin: (totalStrips: number) => void;
  setProgress: (doneStrips: number) => void;
  succeed: (result: ExportFinishResult) => void;
  fail: (error: AppErrorPayload) => void;
  requestCancel: () => void;
  reset: () => void;
}

const initial = {
  status: "idle" as ExportStatus,
  doneStrips: 0,
  totalStrips: 0,
  error: null,
  result: null,
  cancelRequested: false,
};

export const useExportStore = create<ExportStore>((set) => ({
  ...initial,

  begin: (totalStrips) =>
    set({ ...initial, status: "running", totalStrips, doneStrips: 0, cancelRequested: false }),
  setProgress: (doneStrips) => set({ doneStrips }),
  succeed: (result) => set({ status: "done", result, error: null }),
  fail: (error) => set({ status: "error", error }),
  requestCancel: () => set({ cancelRequested: true }),
  reset: () => set({ ...initial }),
}));
