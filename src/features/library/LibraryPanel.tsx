import { useRef, useState } from "react";
import {
  LIBRARY_SORT_LABELS,
  LIBRARY_SORT_MODES,
  type LibrarySortMode,
} from "../../domain/library";
import { removeAllInstances, removeInstancesByLibraryItem } from "../../domain/document";
import type { LibraryItem } from "../../domain/types";
import { askUser, normalizeError } from "../../platform/ipc";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";
import { Thumbnail } from "./Thumbnail";
import { useImportController } from "./useImportController";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SOURCE_LABEL: Record<string, string> = {
  picker: "文件选择",
  drop: "拖放",
  clipboard: "剪贴板",
};

/** 资源库面板：导入入口 + 排序 + 条目列表 + 释放/清空 + 较大预览 */
export function LibraryPanel() {
  const items = useLibraryStore((s) => s.items);
  const sortMode = useLibraryStore((s) => s.sortMode);
  const setSortMode = useLibraryStore((s) => s.setSortMode);
  const getSorted = useLibraryStore((s) => s.getSorted);
  const moveItem = useLibraryStore((s) => s.moveItem);
  const removeItem = useLibraryStore((s) => s.removeItem);
  const clearLibrary = useLibraryStore((s) => s.clear);

  const doc = useDocStore((s) => s.doc);
  const commitNoHistory = useDocStore((s) => s.commitNoHistory);

  const { report, busy, error, runPicker } = useImportController();

  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** 拖拽排序的高亮目标行 */
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragRef = useRef<{ from: number; active: boolean; over: number | null }>({
    from: -1,
    active: false,
    over: null,
  });
  /** 拖动结束后要吞掉随之而来的 click，避免误触预览 */
  const suppressClickRef = useRef(false);

  const sorted = getSorted();

  /** 释放单个资源：级联移除画布实例，且不进入撤销历史（基线 §6.6、§11.2） */
  async function onRelease(it: LibraryItem) {
    const linked = doc.instances.filter((i) => i.libraryItemId === it.id).length;
    const msg =
      linked > 0
        ? `释放「${it.fileName}」？\n\n画布上与之关联的 ${linked} 个实例也会被移除。\n释放资源不可撤销。`
        : `释放「${it.fileName}」？\n\n释放资源不可撤销。`;

    let confirmed = false;
    try {
      confirmed = await askUser(msg, "释放", "取消");
    } catch (e) {
      setActionError(normalizeError(e).message);
      return;
    }
    if (!confirmed) return; // 取消时任何数据都不得变化

    commitNoHistory((d) => removeInstancesByLibraryItem(d, [it.id]));
    removeItem(it.id);
    if (preview?.id === it.id) setPreview(null);
  }

  /** 清空资源库：批量释放，二次确认（基线 §6.6） */
  async function onClearAll() {
    if (items.length === 0) return;
    const linked = doc.instances.length;
    const msg =
      `清空资源库？共 ${items.length} 项` +
      (linked > 0 ? `，画布上 ${linked} 个关联实例也会被移除` : "") +
      `。\n\n此操作不可撤销。`;

    let confirmed = false;
    try {
      confirmed = await askUser(msg, "清空", "取消");
    } catch (e) {
      setActionError(normalizeError(e).message);
      return;
    }
    if (!confirmed) return;

    // 画布尺寸与背景属于文档设置，清空资源库不应重置它们
    commitNoHistory((d) => removeAllInstances(d));
    clearLibrary();
    setPreview(null);
  }

  /**
   * 列表排序用手写指针事件，而不是 HTML5 draggable。
   *
   * 原因：Windows 上 Tauri 启用原生文件拖放（dragDropEnabled，文件路径只能由原生层给出）
   * 会屏蔽页面内的 HTML5 拖拽事件，两者不能共存。文件拖入是基线硬需求，
   * 所以排序改为自己处理 pointerdown/move/up。
   */
  function beginReorder(e: React.PointerEvent<HTMLLIElement>, index: number) {
    if (e.button !== 0) return;
    const startY = e.clientY;
    dragRef.current = { from: index, active: false, over: null };

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current.active) {
        // 4px 死区：区分"点击查看预览"和"拖动排序"
        if (Math.abs(ev.clientY - startY) < 4) return;
        dragRef.current.active = true;
      }
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const row = el?.closest("li[data-lib-index]") as HTMLElement | null;
      const over = row ? Number(row.dataset.libIndex) : null;
      dragRef.current.over = over;
      setDragOver(over);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const { from, active, over } = dragRef.current;
      if (active) {
        suppressClickRef.current = true;
        if (over !== null && over !== from) moveItem(from, over);
      }
      dragRef.current = { from: -1, active: false, over: null };
      setDragOver(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <aside className="panel panel--left">
      <div className="panel__title">资源库</div>

      <div className="lib-toolbar">
        <button onClick={runPicker} disabled={busy}>
          {busy ? "正在导入…" : "导入图片"}
        </button>
        <select
          className="lib-sort"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as LibrarySortMode)}
          disabled={items.length === 0}
          title="排序方式"
        >
          {LIBRARY_SORT_MODES.map((m) => (
            <option key={m} value={m}>
              {LIBRARY_SORT_LABELS[m]}
            </option>
          ))}
        </select>
        <span className="lib-toolbar__spacer" />
        {items.length > 0 ? (
          <button className="btn-quiet" onClick={onClearAll} title="清空资源库">
            清空
          </button>
        ) : null}
      </div>

      <div className="lib-hint">
        {items.length === 0
          ? "支持 PNG / JPG / WebP / BMP，可拖入文件或按 Ctrl+V 粘贴"
          : `共 ${items.length} 项 · 拖拽可调整顺序`}
      </div>

      {error ? (
        <div className="report report--error">
          <div>{error.message}</div>
          {error.hint ? <div className="report__hint">{error.hint}</div> : null}
        </div>
      ) : null}

      {actionError ? (
        <div className="report report--error">
          <div>{actionError}</div>
        </div>
      ) : null}

      {report ? (
        <div className="report">
          {report.cancelled ? (
            <div>已取消{SOURCE_LABEL[report.source]}导入</div>
          ) : (
            <div>
              {SOURCE_LABEL[report.source]}导入：成功 {report.addedCount} 张
            </div>
          )}
          {report.skippedDuplicateCount > 0 ? (
            <div>跳过重复文件 {report.skippedDuplicateCount} 个</div>
          ) : null}
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
              <li
                className={`lib-item${preview?.id === it.id ? " lib-item--active" : ""}${
                  dragOver === idx ? " lib-item--drop-target" : ""
                }`}
                key={it.id}
                data-lib-index={idx}
                onPointerDown={(e) => beginReorder(e, idx)}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  setPreview(it);
                }}
                title="点击查看较大预览，按住拖动可调整顺序"
              >
                <span className="lib-item__index">{idx + 1}</span>
                <Thumbnail path={it.sourcePath} alt={it.fileName} />
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
                <button
                  className="lib-item__release"
                  title="释放该资源"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onRelease(it);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview ? (
        <div className="preview-overlay" onClick={() => setPreview(null)}>
          <div className="preview-overlay__panel" onClick={(e) => e.stopPropagation()}>
            <div className="preview-overlay__head">
              <span className="preview-overlay__name" title={preview.sourcePath}>
                {preview.fileName}
              </span>
              <span className="preview-overlay__dims">
                {preview.width} × {preview.height}
              </span>
              <button onClick={() => setPreview(null)}>关闭</button>
            </div>
            <div className="preview-overlay__stage">
              <Thumbnail
                path={preview.sourcePath}
                maxEdge={1024}
                alt={preview.fileName}
                className="preview-img"
              />
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
