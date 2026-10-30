import { useEffect, useRef, useState } from "react";
import { filterAliveSelection, updateInstance } from "../../domain/document";
import { snapMove, type SnapGuide } from "../../domain/snap";
import type { Frame, Id } from "../../domain/types";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";
import { useViewStore } from "../../state/viewStore";
import { KonvaStage } from "../scene/KonvaStage";
import { deriveScene } from "../scene/derive";
import { placeAllItems } from "./placement";
import { useSceneSources } from "./useSceneSources";
import { useCanvasShortcuts } from "./useCanvasShortcuts";

/** 吸附阈值（屏幕像素）：折算到画布坐标后，不同缩放下的手感一致 */
const SNAP_SCREEN_PX = 6;

/** 画布区域：视图控制条 + Konva 舞台 / 空状态 */
export function CanvasArea() {
  const doc = useDocStore((s) => s.doc);
  const items = useLibraryStore((s) => s.items);
  const commit = useDocStore((s) => s.commit);
  const endMerge = useDocStore((s) => s.endMerge);

  const zoom = useViewStore((s) => s.zoom);
  const panX = useViewStore((s) => s.panX);
  const panY = useViewStore((s) => s.panY);
  const selection = useViewStore((s) => s.selection);
  const setZoom = useViewStore((s) => s.setZoom);
  const zoomAt = useViewStore((s) => s.zoomAt);
  const panBy = useViewStore((s) => s.panBy);
  const fitToViewport = useViewStore((s) => s.fitToViewport);
  const setSelection = useViewStore((s) => s.setSelection);
  const toggleSelection = useViewStore((s) => s.toggleSelection);
  const clearSelection = useViewStore((s) => s.clearSelection);
  const openCellPicker = useViewStore((s) => s.openCellPicker);

  useCanvasShortcuts();

  const sources = useSceneSources(doc, items);
  const scene = deriveScene(doc, sources);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fittedRef = useRef(false);

  // 首次拿到视口尺寸后自动"适应画布"，之后不再自动干预用户视图
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: host.clientWidth, h: host.clientHeight });
    });
    ro.observe(host);
    setSize({ w: host.clientWidth, h: host.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (fittedRef.current) return;
    if (size.w <= 0 || size.h <= 0) return;
    fitToViewport(doc.canvas.width, doc.canvas.height, size.w, size.h);
    fittedRef.current = true;
  }, [size.w, size.h, doc.canvas.width, doc.canvas.height, fitToViewport]);

  // 实例被删除（或释放资源级联删除）后，清理指向它的选中
  useEffect(() => {
    const alive = filterAliveSelection(doc, selection);
    if (alive.length !== selection.length) setSelection(alive);
  }, [doc, selection, setSelection]);

  /** 点击命中：null = 点空白。additive（Ctrl/Shift）时不清除既有选择 */
  function handleSelect(id: Id | null, additive: boolean) {
    if (id === null) {
      if (!additive) clearSelection();
      return;
    }
    if (additive) {
      toggleSelection(id);
      return;
    }
    // 点中已在选中集合里的对象时保持多选原样——否则多选后无法整体拖动，
    // 批量移动会变成"一次只能拖一个"。
    if (!useViewStore.getState().selection.includes(id)) setSelection([id]);
  }

  /** 百分比输入框的编辑中值；失焦/回车时才应用到视图 */
  const [zoomText, setZoomText] = useState("100");

  useEffect(() => {
    setZoomText(String(Math.round(zoom * 100)));
  }, [zoom]);

  function commitZoomInput() {
    const v = Number(zoomText);
    if (!Number.isFinite(v) || v <= 0) {
      setZoomText(String(Math.round(zoom * 100)));
      return;
    }
    setZoom(v / 100); // 上下限由 store 统一裁剪
  }

  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const dragBaseRef = useRef<Array<{ id: Id; frame: Frame }> | null>(null);

  /** 拖动开始：记录起始外框。吸附必须基于起点计算，否则位移会随增量累积漂移 */
  function handleDragStart() {
    const ids = new Set(useViewStore.getState().selection);
    const d = useDocStore.getState().doc;
    dragBaseRef.current = d.instances
      .filter((it) => ids.has(it.id))
      .map((it) => ({ id: it.id, frame: it.frame }));
  }

  /** 拖动中：按"起点 + 总位移"重算位置，并按屏幕 6px 阈值吸附 */
  function handleMoveSelected(dx: number, dy: number, snapEnabled: boolean) {
    const base = dragBaseRef.current;
    if (!base || base.length === 0) return;
    if (dx === 0 && dy === 0) return;

    const d = useDocStore.getState().doc;
    const z = useViewStore.getState().zoom || 1;
    const r = snapMove(
      d,
      base.map((b) => b.id),
      base.map((b) => b.frame),
      dx,
      dy,
      snapEnabled ? SNAP_SCREEN_PX / z : 0,
    );
    setGuides(r.guides);

    commit(
      (cur) => {
        let next = cur;
        for (const b of base) {
          next = updateInstance(next, b.id, {
            frame: { ...b.frame, x: b.frame.x + r.dx, y: b.frame.y + r.dy },
          });
        }
        return next;
      },
      { label: "拖动图片", mergeKey: `drag:${base.map((b) => b.id).join(",")}` },
    );
  }

  function handleEndMove() {
    dragBaseRef.current = null;
    setGuides([]);
    endMerge();
  }
  /** 控制点缩放：整段拖动共用一个 mergeKey，撤销一次即回到缩放前 */
  function handleResizeSelected(frame: Frame) {
    const current = useViewStore.getState().selection;
    if (current.length !== 1) return;
    const id = current[0];
    commit((d) => updateInstance(d, id, { frame }), {
      label: "调整尺寸",
      mergeKey: `resize:${id}`,
    });
  }

  const hasInstances = doc.instances.length > 0;

  return (
    <main className="canvas-area" ref={hostRef}>
      <div className="canvas-toolbar">
        <button
          onClick={() => fitToViewport(doc.canvas.width, doc.canvas.height, size.w, size.h)}
          title="缩放至完整显示画布"
        >
          适应画布
        </button>
        <button onClick={() => setZoom(1)} title="缩放至 100%">
          100%
        </button>
        <input
          className="canvas-toolbar__zoom"
          type="number"
          min={5}
          max={800}
          step={10}
          value={zoomText}
          onChange={(e) => setZoomText(e.target.value)}
          onBlur={commitZoomInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitZoomInput();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setZoomText(String(Math.round(zoom * 100)));
              e.currentTarget.blur();
            }
          }}
          title="缩放百分比（5% ~ 800%）"
        />
        <span className="canvas-toolbar__unit">%</span>
        <span className="canvas-toolbar__meta">
          {doc.canvas.width} × {doc.canvas.height}
          {hasInstances ? ` · ${doc.instances.length} 个实例` : ""}
          {scene.pendingCount > 0 ? ` · ${scene.pendingCount} 张加载中` : ""}
          {selection.length > 0 ? ` · 选中 ${selection.length} 个` : ""}
        </span>
        <span className="canvas-toolbar__spacer" />
        {items.length > 0 ? (
          <button onClick={() => placeAllItems()} title="按资源库顺序铺满画布">
            全部添加
          </button>
        ) : null}
      </div>

      {hasInstances ? (
        <KonvaStage
          doc={doc}
          sources={sources}
          view={{ zoom, panX, panY, selection }}
          selection={selection}
          guides={guides}
          onSelect={handleSelect}
          onDragStart={handleDragStart}
          onMoveSelected={handleMoveSelected}
          onResizeSelected={handleResizeSelected}
          onEndMove={handleEndMove}
          onEmptyCellClick={openCellPicker}
          onZoomAt={zoomAt}
          onPanBy={panBy}
        />
      ) : (
        <div className="canvas-empty">
          <div className="canvas-empty__title">画布为空</div>
          <div className="canvas-empty__hint">
            {items.length === 0
              ? "先从左侧导入图片"
              : "双击左侧图片放到画布，或点击「全部添加」"}
          </div>
        </div>
      )}
    </main>
  );
}
