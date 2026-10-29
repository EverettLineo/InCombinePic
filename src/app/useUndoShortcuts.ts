import { useEffect } from "react";
import { useDocStore } from "../state/docStore";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/**
 * 撤销/重做快捷键（基线 §11.1）。
 *
 * - `Ctrl+Z` 撤销
 * - `Ctrl+Y` 或 `Ctrl+Shift+Z` 重做
 * - 焦点在输入控件内时不接管：那里应执行文本撤销（基线 §11.1「输入框获得焦点时，文本编辑快捷键优先」）
 */
export function useUndoShortcuts() {
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);
}
