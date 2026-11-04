/**
 * 撤销/重做历史，纯函数。
 *
 * 采用快照而非命令回放：模板切换这类跨多对象操作回放时极易恢复不完整。
 * past 存变更前的快照，future 存被撤销的状态；任何新编辑都会清空 future。
 */

import type { DocumentState } from "./types";

export interface HistoryEntry {
  /** 用于界面提示，例如"拖动图片" */
  label: string;
  snapshot: DocumentState;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

/** 历史深度上限：超出后丢弃最旧记录，避免长时间编辑吃内存 */
export const HISTORY_LIMIT = 100;

export function emptyHistory(): History {
  return { past: [], future: [] };
}

/** 记录一次变更：把"变更前状态"压入 past，并清空 future */
export function record(
  history: History,
  label: string,
  before: DocumentState,
  limit: number = HISTORY_LIMIT,
): History {
  const past = [...history.past, { label, snapshot: before }];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [] };
}

export interface HistoryStep {
  history: History;
  state: DocumentState;
}

/** 撤销：取栈顶快照，并把当前状态推入 future */
export function undo(history: History, current: DocumentState): HistoryStep | null {
  if (history.past.length === 0) return null;
  const entry = history.past[history.past.length - 1];
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, { label: entry.label, snapshot: current }],
    },
    state: entry.snapshot,
  };
}

/** 重做：取 future 栈顶，并把当前状态压回 past */
export function redo(history: History, current: DocumentState): HistoryStep | null {
  if (history.future.length === 0) return null;
  const entry = history.future[history.future.length - 1];
  return {
    history: {
      past: [...history.past, { label: entry.label, snapshot: current }],
      future: history.future.slice(0, -1),
    },
    state: entry.snapshot,
  };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

/** 下一次撤销会撤销什么，供界面提示用 */
export function nextUndoLabel(history: History): string | null {
  const top = history.past[history.past.length - 1];
  return top ? top.label : null;
}
