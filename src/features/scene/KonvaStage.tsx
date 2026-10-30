import Konva from "konva";
import { useEffect, useRef } from "react";
import { hitTest } from "../../domain/document";
import type { SnapGuide } from "../../domain/snap";
import { applyResize, cursorForHandle, handlePoints } from "../../domain/transform";
import type { DocumentState, Frame, Id, ViewState } from "../../domain/types";
import {
  syncBackground,
  syncCanvasOutline,
  syncEmptyCells,
  syncGuides,
  syncLayer,
  syncSelection,
} from "./apply";
import { deriveScene, type SceneSources } from "./derive";

interface KonvaStageProps {
  doc: DocumentState;
  sources: SceneSources;
  view: ViewState;
  selection: readonly Id[];
  /** 对齐辅助线（吸附结果），只在视图上画，不进导出 */
  guides: readonly SnapGuide[];
  /** 点击命中：null 表示点到空白（additive 时不清除选择） */
  onSelect: (id: Id | null, additive: boolean) => void;
  /** 拖动开始（此时选中集合已更新）：调用方据此记录起始外框 */
  onDragStart: () => void;
  /** 拖动位移（相对拖动起点的总位移）；snapEnabled=false 时按住 Alt 临时关闭吸附 */
  onMoveSelected: (dx: number, dy: number, snapEnabled: boolean) => void;
  /** 控制点缩放后的新外框；调用方用 mergeKey 合并 */
  onResizeSelected: (frame: Frame) => void;
  /** 一次拖动/缩放结束 */
  onEndMove: () => void;
  /** 点击空白单元格（模板模式）：传入模板内单元格下标 */
  onEmptyCellClick: (cellIndex: number) => void;
  onZoomAt: (factor: number, anchorX: number, anchorY: number) => void;
  onPanBy: (dx: number, dy: number) => void;
}

/** 控制点在屏幕上的边长（px），与缩放无关 */
const HANDLE_SCREEN_SIZE = 7;

/**
 * 画布视图。只有本文件（及同目录 apply.ts）可以接触 Konva。
 *
 * 交互：
 * - 左键点击：命中选择（Ctrl/Shift 追加，点空白清除）
 * - 左键拖动：移动选中实例（增量提交，合并为一步撤销）
 * - 拖动选中框的八个控制点：缩放（对边固定）
 * - 滚轮：以指针为锚缩放；Space + 拖动：平移视图
 */
export function KonvaStage({
  doc,
  sources,
  view,
  selection,
  guides,
  onSelect,
  onDragStart,
  onMoveSelected,
  onResizeSelected,
  onEndMove,
  onEmptyCellClick,
  onZoomAt,
  onPanBy,
}: KonvaStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const bgLayerRef = useRef<Konva.Layer | null>(null);
  const contentLayerRef = useRef<Konva.Layer | null>(null);
  const overlayRef = useRef<Konva.Layer | null>(null);

  // 交互回调与最新状态放 ref：事件处理器只在挂载时绑定一次，
  // 闭包捕获旧值会导致"第二次拖动跳回旧位置"这类难查问题
  const zoomRef = useRef(onZoomAt);
  const panRef = useRef(onPanBy);
  const selectRef = useRef(onSelect);
  const dragStartRef = useRef(onDragStart);
  const moveRef = useRef(onMoveSelected);
  const resizeRef = useRef(onResizeSelected);
  const endMoveRef = useRef(onEndMove);
  const emptyCellRef = useRef(onEmptyCellClick);
  const emptyCellsRef = useRef(sceneCells(doc, sources));
  const docRef = useRef(doc);
  const viewRef = useRef(view);
  const selectionRef = useRef(selection);
  zoomRef.current = onZoomAt;
  panRef.current = onPanBy;
  selectRef.current = onSelect;
  dragStartRef.current = onDragStart;
  moveRef.current = onMoveSelected;
  resizeRef.current = onResizeSelected;
  endMoveRef.current = onEndMove;
  emptyCellRef.current = onEmptyCellClick;
  emptyCellsRef.current = sceneCells(doc, sources);
  docRef.current = doc;
  viewRef.current = view;
  selectionRef.current = selection;

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

    const toDocPoint = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      const { zoom, panX, panY } = viewRef.current;
      return {
        x: (clientX - rect.left - panX) / zoom,
        y: (clientY - rect.top - panY) / zoom,
      };
    };

    /** 单选中实例的控制点命中（容差按屏幕像素折算到画布坐标） */
    const hitHandle = (p: { x: number; y: number }) => {
      const sel = selectionRef.current;
      if (sel.length !== 1) return null;
      const inst = docRef.current.instances.find((i) => i.id === sel[0]);
      if (!inst) return null;

      const tol = (HANDLE_SCREEN_SIZE / 2 + 2) / viewRef.current.zoom;
      for (const hp of handlePoints(inst.frame)) {
        if (Math.abs(p.x - hp.x) <= tol && Math.abs(p.y - hp.y) <= tol) return hp.kind;
      }
      return null;
    };

    stage.on("wheel", (e) => {
      e.evt.preventDefault();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
      zoomRef.current(factor, pointer.x, pointer.y);
    });

    let spaceDown = false;
    let panning = false;
    let dragging = false;
    let resizing: { kind: ReturnType<typeof hitHandle>; base: Frame; start: { x: number; y: number } } | null =
      null;
    let last = { x: 0, y: 0 };
    /** 拖动起点（画布坐标）：位移按"相对起点"计算，吸附才不会随增量累积漂移 */
    let dragOrigin = { x: 0, y: 0 };

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

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || spaceDown) return;
      const p = toDocPoint(e.clientX, e.clientY);

      // 控制点优先于命中：否则点在手柄上会变成"选中/拖动"
      const kind = hitHandle(p);
      if (kind) {
        const sel = selectionRef.current;
        const inst = docRef.current.instances.find((i) => i.id === sel[0]);
        if (inst) {
          resizing = { kind, base: inst.frame, start: p };
          host.setPointerCapture(e.pointerId);
          host.style.cursor = cursorForHandle(kind);
          return;
        }
      }

      const hit = hitTest(docRef.current, p.x, p.y);
      if (!hit) {
        // 模板模式下点到空白格：进入填空流程，而不是仅仅清空选择
        const cell = emptyCellsRef.current.find(
          (c) =>
            p.x >= c.frame.x &&
            p.x <= c.frame.x + c.frame.w &&
            p.y >= c.frame.y &&
            p.y <= c.frame.y + c.frame.h,
        );
        if (cell) {
          selectRef.current(null, false);
          emptyCellRef.current(cell.index);
          return;
        }
      }
      selectRef.current(hit, e.ctrlKey || e.shiftKey);
      if (hit) {
        dragging = true;
        dragOrigin = p;
        // 必须在选中集合更新之后记录起始外框，否则拖"未选中对象"时会漏掉它
        dragStartRef.current();
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

      const p = toDocPoint(e.clientX, e.clientY);

      if (resizing && resizing.kind) {
        resizeRef.current(
          applyResize(resizing.base, resizing.kind, p.x - resizing.start.x, p.y - resizing.start.y),
        );
        return;
      }

      if (dragging) {
        // 按住 Alt 临时关闭吸附（D-04 / T6.7），便于精细摆放
        moveRef.current(p.x - dragOrigin.x, p.y - dragOrigin.y, !e.altKey);
        return;
      }

      // 悬停在控制点上时给出缩放指针，帮助用户发现"可以拖"
      const kind = hitHandle(p);
      host.style.cursor = kind ? cursorForHandle(kind) : "default";
    };

    const onPointerUp = (e: PointerEvent) => {
      if (resizing) {
        resizing = null;
        host.style.cursor = "default";
        endMoveRef.current();
        host.releasePointerCapture(e.pointerId);
      }
      if (dragging) {
        dragging = false;
        host.style.cursor = "default";
        endMoveRef.current();
        host.releasePointerCapture(e.pointerId);
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

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scale({ x: view.zoom, y: view.zoom });
    stage.position({ x: view.panX, y: view.panY });
    stage.batchDraw();
  }, [view.zoom, view.panX, view.panY]);

  useEffect(() => {
    const stage = stageRef.current;
    const bgLayer = bgLayerRef.current;
    const contentLayer = contentLayerRef.current;
    const overlay = overlayRef.current;
    if (!stage || !bgLayer || !contentLayer || !overlay) return;

    const scene = deriveScene(doc, sources);

    syncBackground(bgLayer, doc.canvas);
    syncEmptyCells(
      bgLayer,
      scene.emptyCells.map((c) => c.frame),
    );
    contentLayer.clip({ x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height });
    syncLayer(contentLayer, scene);
    syncCanvasOutline(overlay, doc.canvas);
    // 控制点尺寸随缩放补偿，保证屏幕上恒定大小，因此依赖 view.zoom
    syncSelection(overlay, doc, selection, view.zoom);
    syncGuides(overlay, guides);

    bgLayer.batchDraw();
    contentLayer.batchDraw();
    overlay.batchDraw();
  }, [doc, sources, selection, view.zoom, guides]);

  return <div className="stage-host" ref={hostRef} />;
}

/** 只取空白单元格（供事件处理读取最新值，避免闭包旧值） */
function sceneCells(doc: DocumentState, sources: SceneSources) {
  return deriveScene(doc, sources).emptyCells;
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}
