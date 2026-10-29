import { create } from "zustand";
import {
  emptyHistory,
  record,
  redo as redoHistory,
  undo as undoHistory,
  type History,
} from "../domain/history";
import { createEmptyDocument, type DocumentState } from "../domain/types";

/**
 * 文档域 store —— 撤销/重做的容器。
 *
 * 关键设计：所有变更必须经由 `commit`，不允许组件直接 setState 改 doc。
 * 历史栈只在这一处维护，调用点无需关心（docs/ARCHITECTURE.md §8）。
 */

export interface CommitOptions {
  /** 操作名，用于界面提示"将撤销：拖动图片" */
  label?: string;
  /**
   * 合并键。同一 mergeKey 的连续提交会合并为一个撤销步骤。
   * 用于连续拖动：每帧都提交，但用户只应撤销一次。
   */
  mergeKey?: string;
}

/** 同一 mergeKey 的提交在此时长内视为同一次操作 */
const MERGE_WINDOW_MS = 1200;

export interface DocStore extends History {
  doc: DocumentState;
  /** 提交计数，供渲染适配层判断是否需要重建投影 */
  revision: number;
  /** 会话内存在尚未成功导出的画布变更（基线 §13.1 退出保护的判据） */
  dirty: boolean;
  /** 当前合并键与最近提交时间，用于判定能否并入上一步 */
  mergeKey: string | null;
  lastCommitAt: number;

  commit: (recipe: (doc: DocumentState) => DocumentState, opts?: CommitOptions) => void;
  /**
   * 由资源释放等外部动作引起的文档变化，**不进入撤销历史**（基线 §6.6、§11.2）。
   * 语义必须与 commit 分开表达：只有 commit 会入栈。
   */
  commitNoHistory: (recipe: (doc: DocumentState) => DocumentState) => void;
  /** 结束当前合并窗口（例如拖动结束时调用），下一次提交必然开新步骤 */
  endMerge: () => void;
  undo: () => void;
  redo: () => void;
  markExported: () => void;
  reset: () => void;
}

export const useDocStore = create<DocStore>((set, get) => ({
  ...emptyHistory(),
  doc: createEmptyDocument(),
  revision: 0,
  dirty: false,
  mergeKey: null,
  lastCommitAt: 0,

  commit: (recipe, opts) => {
    const s = get();
    const prev = s.doc;
    const next = recipe(prev);
    if (next === prev) return;

    const now = Date.now();
    const label = opts?.label ?? "编辑";
    const key = opts?.mergeKey ?? null;
    const canMerge =
      key !== null && s.mergeKey === key && now - s.lastCommitAt < MERGE_WINDOW_MS;

    // 合并时不开新步骤（用户连拖 100 帧仍只算一步）；否则正常入栈并清空 redo
    const history: History = canMerge
      ? { past: s.past, future: [] }
      : record({ past: s.past, future: s.future }, label, prev);

    set({
      doc: next,
      revision: s.revision + 1,
      dirty: true,
      past: history.past,
      future: history.future,
      mergeKey: key,
      lastCommitAt: now,
    });
  },

  commitNoHistory: (recipe) => {
    const s = get();
    const next = recipe(s.doc);
    if (next === s.doc) return;
    // 资源释放会真实改变画布内容（移除关联实例），因此仍需置脏；
    // 但不写入 past，撤销不会回退这类操作。
    set({ doc: next, revision: s.revision + 1, dirty: true });
  },

  endMerge: () => set({ mergeKey: null, lastCommitAt: 0 }),

  undo: () => {
    const s = get();
    const step = undoHistory({ past: s.past, future: s.future }, s.doc);
    if (!step) return;
    set({
      doc: step.state,
      revision: s.revision + 1,
      dirty: true,
      past: step.history.past,
      future: step.history.future,
      mergeKey: null,
      lastCommitAt: 0,
    });
  },

  redo: () => {
    const s = get();
    const step = redoHistory({ past: s.past, future: s.future }, s.doc);
    if (!step) return;
    set({
      doc: step.state,
      revision: s.revision + 1,
      dirty: true,
      past: step.history.past,
      future: step.history.future,
      mergeKey: null,
      lastCommitAt: 0,
    });
  },

  markExported: () => set({ dirty: false }),

  reset: () =>
    set((s) => ({
      ...emptyHistory(),
      doc: createEmptyDocument(),
      revision: s.revision + 1,
      dirty: false,
      mergeKey: null,
      lastCommitAt: 0,
    })),
}));
