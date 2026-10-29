import Konva from "konva";
import { useEffect, useRef } from "react";
import type { DocumentState, ViewState } from "../../domain/types";
import { syncBackground, syncCanvasOutline, syncLayer } from "./apply";
import { deriveScene, type SceneSources } from "./derive";

interface KonvaStageProps {
  doc: DocumentState;
  sources: SceneSources;
  view: ViewState;
  /** 以视口内某点为锚缩放（滚轮） */
  onZoomAt: (factor: number, anchorX: number, anchorY: number) => void;
  onPanBy: (dx: number, dy: number) => void;
}

/**
 * 画布视图。只有本文件（及同目录 apply.ts）可以接触 Konva。
 *
 * 交互：
 * - 滚轮：以指针为锚缩放（不改变导出尺寸，基线 §5.3）
 * - 按住 Space + 拖动：平移视图
 */
export function KonvaStage({ doc, sources, view, onZoomAt, onPanBy }: KonvaStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const bgLayerRef = useRef<Konva.Layer | null>(null);
  const contentLayerRef = useRef<Konva.Layer | null>(null);
  const overlayRef = useRef<Konva.Layer | null>(null);

  // 回调放 ref，避免事件绑定随每次渲染重建
  const zoomRef = useRef(onZoomAt);
  const panRef = useRef(onPanBy);
  zoomRef.current = onZoomAt;
  panRef.current = onPanBy;

  // 初始化舞台（只做一次）
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const stage = new Konva.Stage({
      container: host,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
    });

    const bgLayer = new Konva.Layer({ listening: false });
    const contentLayer = new Konva.Layer({ listening: false });
    const overlay = new Konva.Layer({ listening: false });
    stage.add(bgLayer);
    stage.add(contentLayer);
    stage.add(overlay);

    stageRef.current = stage;
    bgLayerRef.current = bgLayer;
    contentLayerRef.current = contentLayer;
    overlayRef.current = overlay;

    // 滚轮缩放：以指针位置为锚点，保证指针下的内容不动
    stage.on("wheel", (e) => {
      e.evt.preventDefault();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
      zoomRef.current(factor, pointer.x, pointer.y);
    });

    // 按住 Space 拖动平移
    let spaceDown = false;
    let dragging = false;
    let last = { x: 0, y: 0 };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isEditable(e.target)) {
        spaceDown = true;
        host.style.cursor = "grab";
        e.preventDefault(); // 阻止页面滚动
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown = false;
        dragging = false;
        host.style.cursor = "default";
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!spaceDown) return;
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
      host.style.cursor = "grabbing";
      host.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      panRef.current(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      host.style.cursor = spaceDown ? "grab" : "default";
      host.releasePointerCapture(e.pointerId);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerUp);

    const ro = new ResizeObserver(() => {
      stage.width(Math.max(1, host.clientWidth));
      stage.height(Math.max(1, host.clientHeight));
    });
    ro.observe(host);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      ro.disconnect();
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  // 视图变化：缩放与平移只作用于舞台，不影响文档与导出尺寸
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scale({ x: view.zoom, y: view.zoom });
    stage.position({ x: view.panX, y: view.panY });
    stage.batchDraw();
  }, [view.zoom, view.panX, view.panY]);

  // 文档 / 图像源变化：重建投影
  useEffect(() => {
    const stage = stageRef.current;
    const bgLayer = bgLayerRef.current;
    const contentLayer = contentLayerRef.current;
    const overlay = overlayRef.current;
    if (!stage || !bgLayer || !contentLayer || !overlay) return;

    const scene = deriveScene(doc, sources);

    syncBackground(bgLayer, doc.canvas);
    // 超出画布边界的内容在视图与导出中都应被裁切（基线 §5.3、§10.2）
    contentLayer.clip({ x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height });
    syncLayer(contentLayer, scene);
    syncCanvasOutline(overlay, doc.canvas);

    bgLayer.batchDraw();
    contentLayer.batchDraw();
    overlay.batchDraw();
  }, [doc, sources]);

  return <div className="stage-host" ref={hostRef} />;
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}
