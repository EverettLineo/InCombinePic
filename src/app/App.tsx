import { useEffect, useState } from "react";
import { getAppInfo, normalizeError, type AppInfo, type AppErrorPayload } from "../platform/ipc";
import { useDocStore } from "../state/docStore";
import { useLibraryStore } from "../state/libraryStore";
import { useViewStore } from "../state/viewStore";
import { LibraryPanel } from "../features/library/LibraryPanel";

/**
 * 应用外壳。P1 阶段验证：启动、三栏骨架、IPC 往返、三域 store 接线。
 * 真实功能面板在 T2.7（资源库）/ T3.2（画布）/ T7.x（属性）中逐个替换。
 */
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<AppErrorPayload | null>(null);

  const doc = useDocStore((s) => s.doc);
  const dirty = useDocStore((s) => s.dirty);
  const itemCount = useLibraryStore((s) => s.items.length);
  const selection = useViewStore((s) => s.selection);
  const zoom = useViewStore((s) => s.zoom);

  useEffect(() => {
    getAppInfo()
      .then(setInfo)
      .catch((e) => setError(normalizeError(e)));
  }, []);

  const hasSelection = selection.length > 0;

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

        <main className="canvas-area">
          <div className="canvas-area__placeholder">
            画布 {doc.canvas.width} × {doc.canvas.height} · 视图 {Math.round(zoom * 100)}%
            {itemCount > 0 && doc.instances.length === 0 ? " · 从左侧选择图片开始排版" : ""}
          </div>
        </main>

        <aside className="panel panel--right">
          <div className="panel__title">属性 / 图层</div>
          <div className="panel__body">
            {hasSelection
              ? `已选中 ${selection.length} 个对象`
              : `未选中对象${doc.instances.length > 0 ? ` · 共 ${doc.instances.length} 个实例` : ""}`}
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
