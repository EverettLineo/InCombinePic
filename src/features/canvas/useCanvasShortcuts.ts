import { useEffect } from "react";
import { removeInstances } from "../../domain/document";
import { useDocStore } from "../../state/docStore";
import { useViewStore } from "../../state/viewStore";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/**
 * 画布编辑快捷键（基线 §11.1）：
 * - `Delete` 删除选中实例（可撤销，不删资源）
 * - `Esc` 取消当前交互，再取消选择
 *
 * 焦点在输入控件内时不接管，文本编辑优先。
 */
export function useCanvasShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const view = useViewStore.getState();
      const docStore = useDocStore.getState();

      if (e.key === "Delete" || e.key === "Backspace") {
        if (view.selection.length === 0) return;
        e.preventDefault();
        // 删除的是画布实例：可撤销、且不删除资源库条目（基线 §7.3）
        docStore.commit((d) => removeInstances(d, view.selection), { label: "删除实例" });
        view.clearSelection();
      } else if (e.key === "Escape") {
        // 基线 §11.1：Esc 先取消当前编辑/交互，再取消选择。
        // 当前没有活动交互（拖动由 pointerup 收口），因此直接取消选择。
        view.clearSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
