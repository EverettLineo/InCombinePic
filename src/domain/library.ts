/**
 * 资源库排序（基线 §6.5）。
 *
 * 三条硬要求：
 * 1. 自定义顺序必须可恢复 —— 切换排序模式不破坏已保存的手动顺序；
 * 2. 同名文件要有稳定次级规则（导入序号），避免顺序无故跳动；
 * 3. 模板填充顺序使用"当前生效"的顺序（基线 §6.5 末条）。
 */

import type { Id, LibraryItem } from "./types";

export type LibrarySortMode = "custom" | "name" | "importedAt";

export const LIBRARY_SORT_MODES: readonly LibrarySortMode[] = ["custom", "name", "importedAt"];

export const LIBRARY_SORT_LABELS: Record<LibrarySortMode, string> = {
  custom: "自定义顺序",
  name: "文件名",
  importedAt: "导入时间",
};

/**
 * 维护自定义顺序列表：移除已不存在的条目，并把新导入的条目追加到末尾。
 * 这样"再次添加"的条目不会插到中间，已有手动顺序也不被打乱。
 */
export function reconcileCustomOrder(items: readonly LibraryItem[], customOrder: readonly Id[]): Id[] {
  const alive = new Set(items.map((i) => i.id));
  const kept = customOrder.filter((id) => alive.has(id));
  const keptSet = new Set(kept);
  const appended = items.filter((i) => !keptSet.has(i.id)).map((i) => i.id);
  return [...kept, ...appended];
}

/** 按给定模式排序，返回新数组，不修改入参 */
export function sortLibrary(
  items: readonly LibraryItem[],
  mode: LibrarySortMode,
  customOrder: readonly Id[],
): LibraryItem[] {
  const arr = items.slice();

  if (mode === "custom") {
    const pos = new Map<Id, number>();
    customOrder.forEach((id, idx) => pos.set(id, idx));
    // 未出现在自定义顺序中的条目排在最后，并保持导入序稳定
    arr.sort((a, b) => {
      const pa = pos.get(a.id);
      const pb = pos.get(b.id);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return a.importSeq - b.importSeq;
    });
    return arr;
  }

  if (mode === "name") {
    arr.sort((a, b) => {
      const c = a.fileName.localeCompare(b.fileName, "zh-Hans-CN", { numeric: true });
      // 同名文件的稳定次级规则：导入序号（基线 §6.5）
      return c !== 0 ? c : a.importSeq - b.importSeq;
    });
    return arr;
  }

  // 导入时间：先导入的在前；同一毫秒内以导入序号兜底，保证稳定
  arr.sort((a, b) => (a.importedAt !== b.importedAt ? a.importedAt - b.importedAt : a.importSeq - b.importSeq));
  return arr;
}

/** 在自定义顺序中把 from 位置的条目移动到 to 位置 */
export function moveInOrder(order: readonly Id[], from: number, to: number): Id[] {
  const n = order.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return order.slice();
  const next = order.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 显示用顺序编号：从 1 开始（基线 §6.5 "提供顺序编号"） */
export function displayIndex(sortedIndex: number): number {
  return sortedIndex + 1;
}
