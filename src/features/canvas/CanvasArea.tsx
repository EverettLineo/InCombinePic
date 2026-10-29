import { useEffect, useRef, useState } from "react";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";
import { useViewStore } from "../../state/viewStore";
import { KonvaStage } from "../scene/KonvaStage";
import { deriveScene } from "../scene/derive";
import { placeAllItems } from "./placement";
import { useSceneSources } from "./useSceneSources";

/** 画布区域：视图控制条 + Konva 舞台 / 空状态 */
export function CanvasArea() {
  const doc = useDocStore((s) => s.doc);
  const items = useLibraryStore((s) => s.items);
  const zoom = useViewStore((s) => s.zoom);
  const panX = useViewStore((s) => s.panX);
  const panY = useViewStore((s) => s.panY);
  const selection = useViewStore((s) => s.selection);
  const setZoom = useViewStore((s) => s.setZoom);
  const zoomAt = useViewStore((s) => s.zoomAt);
  const panBy = useViewStore((s) => s.panBy);
  const fitToViewport = useViewStore((s) => s.fitToViewport);

  const sources = useSceneSources(doc, items);
  const scene = deriveScene(doc, sources);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fittedRef = useRef(false);
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
