import { useRef, useState } from "react";
import { displayIndexToArray } from "../../domain/align";
import { reorderInstance } from "../../domain/document";
import type { Id } from "../../domain/types";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";
import { useViewStore } from "../../state/viewStore";
import { Thumbnail } from "../../ui/Thumbnail";

/**
 * 图层列表（T6.3）。
 *
 * 三条硬要求来自基线 §8.5：
 * 1. 顺序与画布堆叠完全一致 —— 列表顶部是最上层，故显示顺序是数组的逆序；
 * 2. 拖拽排序后立即生效 —— 直接改文档数组顺序，渲染是派生结果；
 * 3. 透明度 0 的对象也必须能选中 —— 列表选中只依赖 id，与像素无关。
 *
 * 排序交互用指针事件而非 HTML5 拖拽：Windows 上启用原生文件拖放后，
 * 页面内 HTML5 拖拽会被屏蔽（D-004），资源库列表已因此改过实现。
 */
export function LayerPanel() {
  const doc = useDocStore((s) => s.doc);
  const commit = useDocStore((s) => s.commit);
  const selection = useViewStore((s) => s.selection);
  const setSelection = useViewStore((s) => s.setSelection);
  const toggleSelection = useViewStore((s) => s.toggleSelection);
  const findById = useLibraryStore((s) => s.findById);

  const [dragOver, setDragOver] = useState<number | null>(null);
  /** onUp 里读到的是闭包旧 state，故高亮目标同时镜像到 ref */
  const dragOverRef = useRef<number | null>(null);
  /** 拖动结束后吞掉随之而来的 click，避免误触发选中 */
  const suppressClickRef = useRef(false);

  const count = doc.instances.length;
  // 显示顺序：数组末尾（顶层）排在列表最前
  const display = doc.instances.slice().reverse();
  const selected = new Set(selection);

  function setOver(v: number | null) {
    dragOverRef.current = v;
    setDragOver(v);
  }

  function onRowClick(e: React.MouseEvent, id: Id) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey) toggleSelection(id);
    else setSelection([id]);
  }

  function onRowPointerDown(e: React.PointerEvent, displayIndex: number) {
    if (e.button !== 0) return;
    const startY = e.clientY;
    let active = false;
    setOver(displayIndex);

    const onMove = (ev: PointerEvent) => {
      if (!active && Math.abs(ev.clientY - startY) < 4) return;
      active = true;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el?.closest("[data-layer-index]") as HTMLElement | null;
      const idx = row ? Number(row.dataset.layerIndex) : NaN;
      if (Number.isInteger(idx)) setOver(idx);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const target = dragOverRef.current;
      if (active && target !== null && target !== displayIndex) {
        const from = displayIndexToArray(displayIndex, count);
        const to = displayIndexToArray(target, count);
        commit((d) => reorderInstance(d, from, to), { label: "调整图层顺序" });
        suppressClickRef.current = true;
      }
      setOver(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  if (count === 0) {
    return <div className="empty-hint">画布为空，图层列表暂无内容</div>;
  }

  return (
    <>
      <div className="layer-hint">列表顶部 = 画布最上层 · 按住拖动可调整堆叠</div>
      <ul className="layer-list">
        {display.map((it, idx) => {
          const item = findById(it.libraryItemId);
          const isSel = selected.has(it.id);
          return (
            <li
              key={it.id}
              data-layer-index={idx}
              className={`layer-item${isSel ? " layer-item--active" : ""}${
                dragOver === idx ? " layer-item--drop" : ""
              }`}
              onClick={(e) => onRowClick(e, it.id)}
              onPointerDown={(e) => onRowPointerDown(e, idx)}
              title={`${item?.fileName ?? "未知资源"} · 点击选中，按住拖动调整层级`}
            >
              <span className="layer-item__stack">{count - idx}</span>
              {item ? (
                <Thumbnail
                  path={item.sourcePath}
                  maxEdge={64}
                  alt={item.fileName}
                  className="layer-item__thumb"
                />
              ) : (
                <span className="thumb layer-item__thumb thumb--failed">×</span>
              )}
              <span className="layer-item__main">
                <span className="layer-item__name">{item?.fileName ?? "（资源已释放）"}</span>
                <span className="layer-item__meta">
                  {Math.round(it.frame.w)} × {Math.round(it.frame.h)}
                  {it.opacity < 1 ? ` · 不透明度 ${Math.round(it.opacity * 100)}%` : ""}
                  {it.rotation !== 0 ? ` · ${it.rotation}°` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
