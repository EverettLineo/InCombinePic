import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeError, onFileDrop, type AppErrorPayload } from "../../platform/ipc";
import {
  importFromClipboard,
  importFromDrop,
  importImages,
  type ImportReport,
} from "./importFlow";

/** 焦点在可编辑控件上时，Ctrl+V 必须走文本粘贴（基线 §6.2） */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/**
 * 导入控制器：把三种入口（选择器 / 拖放 / 剪贴板）统一到一个状态机里。
 * 同一时刻只允许一个导入任务，避免并发导致判重结果互相看不见。
 */
export function useImportController() {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppErrorPayload | null>(null);
  const busyRef = useRef(false);

  const run = useCallback(async (fn: () => Promise<ImportReport | null>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (r) setReport(r);
    } catch (e) {
      setError(normalizeError(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const runPicker = useCallback(() => run(importImages), [run]);
  const runClipboard = useCallback(() => run(importFromClipboard), [run]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    // 拖放：OS 级文件拖入，与页面内拖拽（列表排序）互不干扰
    onFileDrop((paths) => {
      void run(() => importFromDrop(paths));
    })
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      })
      .catch(() => {
        /* 拖放监听注册失败不应阻断选择器导入 */
      });

    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      // 仅当剪贴板里确实有图片时才拦截，不干扰其他粘贴行为
      const hasImage = Array.from(e.clipboardData?.items ?? []).some((it) =>
        it.type.startsWith("image/"),
      );
      if (!hasImage) return;
      e.preventDefault();
      void run(importFromClipboard);
    };
    window.addEventListener("paste", onPaste);

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("paste", onPaste);
    };
  }, [run]);

  return { report, busy, error, runPicker, runClipboard };
}
