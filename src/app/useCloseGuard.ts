import { useEffect } from "react";
import { askUser, destroyWindow, onCloseRequested } from "../platform/ipc";
import { useDocStore } from "../state/docStore";

/**
 * 退出保护。
 *
 * 判据：会话内文档状态发生过变化且此后未成功导出，即视为有未导出编辑。
 * 该状态由 `docStore.dirty` 承载：每次 commit 置脏，成功导出后清除。
 *
 * 取消退出时不做清理，现场完整保留。
 */
export function useCloseGuard() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void onCloseRequested(async (preventDefault) => {
      if (!useDocStore.getState().dirty) return;
      // 先拦住关闭，再问；反过来的话窗口可能已经关了
      preventDefault();
      const ok = await askUser(
        "有尚未导出的修改。\n\n退出后本次编辑不会保留，是否继续退出？",
        "退出",
        "继续编辑",
      );
      if (ok) await destroyWindow();
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // 拦截失败不阻断使用：最坏情况是退出时不提示
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
