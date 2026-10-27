import { create } from "zustand";
import {
  moveInOrder,
  reconcileCustomOrder,
  sortLibrary,
  type LibrarySortMode,
} from "../domain/library";
import type { Id, LibraryItem } from "../domain/types";

/**
 * 资源库域 store。
 *
 * 与 docStore 分离的理由（基线 §11.2）：
 * 资源库的导入 / 释放 / 清空**不进入画布撤销历史**，
 * 而画布实例的增删属于可撤销编辑。两者混在一个 store 里迟早会串。
 */
export interface LibraryStore {
  items: LibraryItem[];
  /** 用户手动顺序，独立保存；切换排序模式不清空（基线 §6.5） */
  customOrder: Id[];
  sortMode: LibrarySortMode;

  addItems: (list: readonly LibraryItem[]) => void;
  /** 释放单个条目（级联移除画布实例由调用方通过 docStore 完成） */
  removeItem: (id: Id) => void;
  clear: () => void;
  setSortMode: (mode: LibrarySortMode) => void;
  /** 拖拽排序：作用于自定义顺序，并自动切回 custom 模式 */
  moveItem: (from: number, to: number) => void;
  /** 按当前模式返回排序结果（不缓存，≤50 项开销可忽略） */
  getSorted: () => LibraryItem[];
  findById: (id: Id) => LibraryItem | undefined;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  items: [],
  customOrder: [],
  sortMode: "custom",

  addItems: (list) =>
    set((s) => {
      const items = [...s.items, ...list];
      return { items, customOrder: reconcileCustomOrder(items, s.customOrder) };
    }),

  removeItem: (id) =>
    set((s) => {
      const items = s.items.filter((i) => i.id !== id);
      return { items, customOrder: reconcileCustomOrder(items, s.customOrder) };
    }),

  clear: () => set({ items: [], customOrder: [] }),

  setSortMode: (mode) => set({ sortMode: mode }),

  moveItem: (from, to) =>
    set((s) => {
      // 拖拽必须以当前可见顺序为基准，故先把可见顺序落成自定义顺序
      const visible = sortLibrary(s.items, s.sortMode, s.customOrder).map((i) => i.id);
      const nextOrder = moveInOrder(visible, from, to);
      return { customOrder: nextOrder, sortMode: "custom" };
    }),

  getSorted: () => {
    const s = get();
    return sortLibrary(s.items, s.sortMode, s.customOrder);
  },

  findById: (id) => get().items.find((i) => i.id === id),
}));
