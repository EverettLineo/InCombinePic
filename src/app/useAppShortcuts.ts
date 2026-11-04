import { useEffect } from "react";
import { removeInstances } from "../domain/document";
import { useDocStore } from "../state/docStore";
import { useExportStore } from "../state/exportStore";
import { useViewStore } from "../state/viewStore";

/** 焦点在可编辑控件上时，所有全局快捷键都让位给文本编辑 */
function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/**
 * 全局快捷键的唯一实现入口。
 *
 * 集中在一处：分散成多个监听器时，「Esc 先关弹窗还是先取消选择」这类优先级问题
 * 会退化成监听器注册顺序问题。键位清单见 docs/SHORTCUTS.md。
 */
export function useAppShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 输入框内的 Esc 也要让位：那里应回滚本次输入，而不是取消画布选择
      if (isEditable(e.target)) return;

      const view = useViewStore.getState();
      const docStore = useDocStore.getState();
      const modalOpen =
        Boolean(view.cropEditor) || Boolean(view.picker) || view.exportOpen || view.aboutOpen;

      if (e.key === "Escape") {
        e.preventDefault();
        // 先取消当前编辑与交互，再取消选择
        if (view.cropEditor) {
          view.closeCropEditor();
          return;
        }
        if (view.picker) {
          view.closePicker();
          return;
        }
        if (view.settingsOpen) {
          view.closeSettings();
          return;
        }
        if (view.aboutOpen) {
          view.closeAbout();
          return;
        }
        if (view.exportOpen) {
          // 导出进行中不允许用 Esc 关面板：那会让人以为导出被取消了
          if (useExportStore.getState().status !== "running") view.closeExport();
          return;
        }
        view.clearSelection();
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) docStore.redo();
          else docStore.undo();
          return;
        }
        if (key === "y") {
          e.preventDefault();
          docStore.redo();
          return;
        }
        if (key === "a") {
          if (modalOpen) return;
          e.preventDefault();
          view.setSelection(docStore.doc.instances.map((it) => it.id));
          return;
        }
        if (key === "o") {
          e.preventDefault();
          view.requestImport();
          return;
        }
        if (key === "e") {
          e.preventDefault();
          view.openExport();
          return;
        }
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && !modalOpen) {
        if (view.selection.length === 0) return;
        e.preventDefault();
        // 删除的是画布实例：可撤销，且不删除资源库条目
        docStore.commit((d) => removeInstances(d, view.selection), { label: "删除实例" });
        view.clearSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
