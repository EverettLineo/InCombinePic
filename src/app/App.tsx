import { useEffect, useState } from "react";
import { CanvasArea } from "../features/canvas/CanvasArea";
import { LibraryPanel } from "../features/library/LibraryPanel";
import { getAppInfo, normalizeError, type AppErrorPayload, type AppInfo } from "../platform/ipc";
import { useDocStore } from "../state/docStore";
import { useViewStore } from "../state/viewStore";
import { ErrorBoundary } from "../ui/ErrorBoundary";

/** 应用外壳：三栏工作区（左资源 / 中画布 / 右属性），遵循基线 §5.2 */
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<AppErrorPayload | null>(null);

  const instanceCount = useDocStore((s) => s.doc.instances.length);
  const dirty = useDocStore((s) => s.dirty);
  const selection = useViewStore((s) => s.selection);

  useEffect(() => {
    getAppInfo()
      .then(setInfo)
      .catch((e) => setError(normalizeError(e)));
  }, []);

  return (
    <div className="workspace">
      <header className="header">
        <span className="header__title">{info?.name ?? "拼图工具"}</span>
        <span className="header__meta">{info ? `v${info.version}` : "正在获取版本…"}</span>
        {dirty ? <span className="header__meta">· 有未导出修改</span> : null}
        <span className="header__spacer" />
        {info?.offline ? <span className="badge">本地处理 · 离线可用</span> : null}
      </header>

      <div className="body">
        <LibraryPanel />

        <ErrorBoundary areaName="画布">
          <CanvasArea />
        </ErrorBoundary>

        <aside className="panel panel--right">
          <div className="panel__title">属性 / 图层</div>
          <div className="panel__body">
            {selection.length > 0
              ? `已选中 ${selection.length} 个对象`
              : `未选中对象${instanceCount > 0 ? ` · 共 ${instanceCount} 个实例` : ""}`}
          </div>
        </aside>
      </div>

      {error ? (
        <div className="error-box">
          <div>{error.message}</div>
          {error.hint ? <div>{error.hint}</div> : null}
          <div>错误码：{error.code}</div>
        </div>
      ) : null}
    </div>
  );
}
