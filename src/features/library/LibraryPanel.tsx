import { useState } from "react";
import { LIBRARY_SORT_LABELS } from "../../domain/library";
import { normalizeError, type AppErrorPayload } from "../../platform/ipc";
import { useLibraryStore } from "../../state/libraryStore";
import { importImages, type ImportReport } from "./importFlow";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 资源库面板：导入入口 + 条目列表 + 导入结果汇总 */
export function LibraryPanel() {
  const items = useLibraryStore((s) => s.items);
  const sortMode = useLibraryStore((s) => s.sortMode);
  const getSorted = useLibraryStore((s) => s.getSorted);

  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<AppErrorPayload | null>(null);

  const sorted = getSorted();

  async function onImport() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const r = await importImages();
      setReport(r);
    } catch (e) {
      setError(normalizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="panel panel--left">
      <div className="panel__title">资源库</div>

      <div className="lib-toolbar">
        <button onClick={onImport} disabled={busy}>
          {busy ? "正在导入…" : "导入图片"}
        </button>
        <span className="lib-toolbar__meta">
          {items.length > 0 ? `${items.length} 项 · ${LIBRARY_SORT_LABELS[sortMode]}` : "支持 PNG/JPG/WebP/BMP"}
        </span>
      </div>

      {error ? (
        <div className="report report--error">
          <div>{error.message}</div>
          {error.hint ? <div className="report__hint">{error.hint}</div> : null}
        </div>
      ) : null}

      {report ? (
        <div className="report">
          {report.cancelled ? (
            <div>已取消本次导入</div>
          ) : (
            <>
              <div>已导入 {report.addedCount} 张</div>
              {report.skippedDuplicateCount > 0 ? (
                <div>跳过重复文件 {report.skippedDuplicateCount} 个</div>
              ) : null}
            </>
          )}
          {report.failures.length > 0 ? (
            <div className="report__failures">
              <div className="report__failures-title">
                {report.failures.length} 个文件未能导入
              </div>
              <ul>
                {report.failures.map((f) => (
                  <li key={f.path}>
                    <span className="report__file">{f.fileName}</span>
                    <span className="report__reason">{f.message}</span>
                    {f.hint ? <span className="report__hint">{f.hint}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel__body panel__body--list">
        {sorted.length === 0 ? (
          <div className="empty-hint">尚未导入图片</div>
        ) : (
          <ul className="lib-list">
            {sorted.map((it, idx) => (
              <li className="lib-item" key={it.id}>
                <span className="lib-item__index">{idx + 1}</span>
                <span className="lib-item__main">
                  <span className="lib-item__name" title={it.sourcePath}>
                    {it.fileName}
                  </span>
                  <span className="lib-item__meta">
                    {it.width} × {it.height} · {it.format.toUpperCase()} ·{" "}
                    {formatSize(it.fileSize)}
                    {it.hasAlpha ? " · 含透明" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
