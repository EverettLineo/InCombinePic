import { create } from "zustand";
import { createEmptyDocument, type DocumentState } from "../domain/types";

/**
 * 文档域 store —— 撤销/重做的容器。
 *
 * 关键设计：所有变更必须经由 `commit`，不允许组件直接 setState 改 doc。
 * 这样 P4 实现历史栈时，只需在 commit 内部记录前后快照，
 * 不必去逐个调用点补历史逻辑（docs/ARCHITECTURE.md §8）。
 */
export interface DocStore {
  doc: DocumentState;
  /** 提交计数，供渲染适配层判断是否需要重建投影（避免浅比较整棵树） */
  revision: number;
  /** 会话内存在尚未成功导出的画布变更（基线 §13.1 退出保护的判据） */
  dirty: boolean;
  /**
   * 提交一次文档变更。
   * recipe 必须是纯函数；若返回同一引用则视为"无变化"，不递增 revision、不置脏。
   */
  commit: (recipe: (doc: DocumentState) => DocumentState) => void;
  /** 导出成功后调用：清除脏标记（判定规则见 T11.3） */
  markExported: () => void;
  /** 清空画布（不重置资源库） */
  reset: () => void;
}

export const useDocStore = create<DocStore>((set, get) => ({
  doc: createEmptyDocument(),
  revision: 0,
  dirty: false,

  commit: (recipe) => {
    const prev = get().doc;
    const next = recipe(prev);
    if (next === prev) return;
    set((s) => ({ doc: next, revision: s.revision + 1, dirty: true }));
  },

  markExported: () => set({ dirty: false }),

  reset: () =>
    set((s) => ({
      doc: createEmptyDocument(),
      revision: s.revision + 1,
      dirty: false,
    })),
}));
