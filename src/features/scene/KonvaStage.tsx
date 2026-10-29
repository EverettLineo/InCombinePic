import Konva from "konva";
import { useEffect, useRef } from "react";
import { hitTest } from "../../domain/document";
import type { DocumentState, Id, ViewState } from "../../domain/types";
import { syncBackground, syncCanvasOutline, syncLayer, syncSelection } from "./apply";
import { deriveScene, type SceneSources } from "./derive";

interface KonvaStageProps {
  doc: DocumentState;
  sources: SceneSources;
  view: ViewState;
  /** 点击命中：null 表示点到空白（additive 时不清除选择） */
  onSelect: (id: Id | null, additive: boolean) => void;
  /** 拖动选中集合的增量（画布坐标）；每帧调用，调用方用 mergeKey 合并 */
  onMoveSelected: (dx: number, dy: number) => void;
  /** 拖动结束（pointerup） */
  onEndMove: () => void;
  /** 以视口内某点为锚缩放（滚轮） */
  onZoomAt: (factor: number, anchorX: number, anchorY: number) => void;
  onPanBy: (dx: number, dy: number) => void;
}

/**
 * 画布视图。只有本文件（及同目录 apply.ts）可以接触 Konva。
 *
 * 交互：
 * - 左键点击：命中选择（Ctrl/Shift 追加，点空白清除）
 * - 左键按住拖动：移动选中实例（增量提交，由调用方合并为一步撤销）
 * - 滚轮：以指针为锚缩放（不改变导出尺寸，基线 §5.3）
 * - 按住 Space + 拖动：平移视图
 */
export function KonvaStage({
  doc,
  sources,
  view,
  selection,
  onSelect,
  onMoveSelected,
  onEndMove,
  onZoomAt,
  onPanBy,
}: KonvaStageProps & { selection: readonly Id[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const bgLayerRef = useRef<Konva.Layer | null>(null);
  const contentLayerRef = useRef<Konva.Layer | null>(null);
  const overlayRef = useRef<Konva.Layer | null>(null);

  // 交互回调与最新状态放 ref：事件处理器在挂载时绑定一次，
  // 闭包若捕获旧值会出现"拖第一下正常、第二下跳回旧位置"这类难查问题
  const zoomRef = useRef(onZoomAt);
  const panRef = useRef(onPanBy);
  const selectRef = useRef(onSelect);
  const moveRef = useRef(onMoveSelected);
  const endMoveRef = useRef(onEndMove);
  const docRef = useRef(doc);
  const viewRef = useRef(view);
  zoomRef.current = onZoomAt;
  panRef.current = onPanBy;
  selectRef.current = onSelect;
  moveRef.current = onMoveSelected;
  endMoveRef.current = onEndMove;
  docRef.current = doc;
  viewRef.current = view;

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

    /** 屏幕坐标 → 画布（文档）坐标 */
    const toDocPoint = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      const { zoom, panX, panY } = viewRef.current;
      return {
        x: (clientX - rect.left - panX) / zoom,
        y: (clientY - rect.top - panY) / zoom,
      };
    };

    // ---------- 滚轮缩放 ----------
    stage.on("wheel", (e) => {
      e.evt.preventDefault();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
      zoomRef.current(factor, pointer.x, pointer.y);
    });

    // ---------- Space 平移 ----------
    let spaceDown = false;
    let panning = false;
    let last = { x: 0, y: 0 };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isEditable(e.target)) {
        spaceDown = true;
        host.style.cursor = "grab";
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown = false;
        panning = false;
        host.style.cursor = "default";
      }
    };

    // ---------- 选择与拖动 ----------
    let dragging = false;
    let lastDoc = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || spaceDown) return;
      const p = toDocPoint(e.clientX, e.clientY);
      const hit = hitTest(docRef.current, p.x, p.y);

      selectRef.current(hit, e.ctrlKey || e.shiftKey);
      if (hit) {
        dragging = true;
        lastDoc = p;
        host.setPointerCapture(e.pointerId);
        host.style.cursor = "move";
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (spaceDown && panning) {
        panRef.current(e.clientX - last.x, e.clientY - last.y);
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!dragging) return;
      const p = toDocPoint(e.clientX, e.clientY);
      moveRef.current(p.x - lastDoc.x, p.y - lastDoc.y);
      lastDoc = p;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dragging) {
        dragging = false;
        host.releasePointerCapture(e.pointerId);
        host.style.cursor = "default";
        endMoveRef.current();
      }
      if (panning) {
        panning = false;
        host.style.cursor = spaceDown ? "grab" : "default";
        host.releasePointerCapture(e.pointerId);
      }
    };
    const onPointerDownPan = (e: PointerEvent) => {
      if (!spaceDown || e.button !== 0) return;
      panning = true;
      last = { x: e.clientX, y: e.clientY };
      host.style.cursor = "grabbing";
      host.setPointerCapture(e.pointerId);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointerdown", onPointerDownPan);
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
      host.removeEventListener("pointerdown", onPointerDownPan);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      ro.disconnect();
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  // 视图变化：缩放与平移只作用于舞台
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scale({ x: view.zoom, y: view.zoom });
    stage.position({ x: view.panX, y: view.panY });
    stage.batchDraw();
  }, [view.zoom, view.panX, view.panY]);

  // 文档 / 图像源 / 选中变化：重建投影
  useEffect(() => {
    const stage = stageRef.current;
    const bgLayer = bgLayerRef.current;
    const contentLayer = contentLayerRef.current;
    const overlay = overlayRef.current;
    if (!stage || !bgLayer || !contentLayer || !overlay) return;

    const scene = deriveScene(doc, sources);

    syncBackground(bgLayer, doc.canvas);
    contentLayer.clip({ x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height });
    syncLayer(contentLayer, scene);
    syncCanvasOutline(overlay, doc.canvas);
    syncSelection(overlay, doc, selection);

    bgLayer.batchDraw();
    contentLayer.batchDraw();
    overlay.batchDraw();
  }, [doc, sources, selection]);

  return <div className="stage-host" ref={hostRef} />;
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}
