import { useCallback, useEffect, useRef, useState } from "react";
import {
  cropAspectFor,
  initialCropNorm,
  moveCrop,
  resizeCrop,
  toSource,
  type CropHandle,
  type NormRect,
} from "../../domain/crop";
import { fullCrop, setCrop } from "../../domain/document";
import { containCrop, coverCrop, cursorForHandle } from "../../domain/transform";
import type { CropRect } from "../../domain/types";
import { prepareThumbnail, toAssetUrl } from "../../platform/ipc";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";
import { useViewStore } from "../../state/viewStore";

/** 预览图最长边：够看清细节，又不至于把大图整张拉进内存 */
const PREVIEW_MAX_EDGE = 1600;

const HANDLES: CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface DragState {
  mode: "move" | CropHandle;
  start: NormRect;
  /** 拖动起点的指针位置（client 坐标） */
  startX: number;
  startY: number;
  /** 预览图的实际显示框（client 坐标 + 尺寸），用于换算归一化坐标 */
  left: number;
  top: number;
  boxW: number;
  boxH: number;
}

/**
 * 裁剪编辑器（T7.1）。
 *
 * 为什么用独立浮层而不是画布内的裁剪框：
 * 画布中的显示是"裁剪 → 填满格子"的结果，在结果上再框一层，用户看到的是被二次裁过的画面，
 * 拖动手柄时的反馈会很怪。浮层里展示**完整源图**，框住的就是真正的源图像素区域。
 */
export function CropEditor() {
  const instanceId = useViewStore((s) => s.cropEditor);
  if (!instanceId) return null;
  return <CropSession key={instanceId} instanceId={instanceId} />;
}

function CropSession({ instanceId }: { instanceId: string }) {
  const doc = useDocStore((s) => s.doc);
  const commit = useDocStore((s) => s.commit);
  const items = useLibraryStore((s) => s.items);
  const close = useViewStore((s) => s.closeCropEditor);

  const inst = doc.instances.find((i) => i.id === instanceId);
  const item = inst ? items.find((i) => i.id === inst.libraryItemId) : undefined;

  const source = { w: item?.width ?? 1, h: item?.height ?? 1 };
  /** 进入时的可见区域 = 当前裁剪被填满格子后的实际范围，界面从这里起步 */
  // 起点跟随当前适配模式：完整显示时可见区域就是整个 crop，不是 cover 后的中间块
  const fit = inst
    ? doc.fitMode === "contain"
      ? containCrop(inst.crop, inst.rotation, inst.frame)
      : coverCrop(inst.crop, inst.rotation, inst.frame)
    : null;
  const initialVisible: CropRect = fit ? fit.crop : fullCrop(1, 1);

  const [rect, setRect] = useState<NormRect>(() => initialCropNorm(initialVisible, source));
  const [dirty, setDirty] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const aspect = inst ? cropAspectFor(inst.frame, inst.rotation) : 1;
  /** 指针移动回调挂在 window 上，读不到最新 state，故用 ref 镜像 */
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  // 预览图：走缩略图管线（EXIF 已转正、落在 APPCACHE，可被 asset 协议加载）
  useEffect(() => {
    if (!item) return;
    let alive = true;
    prepareThumbnail(item.sourcePath, PREVIEW_MAX_EDGE)
      .then((r) => {
        if (alive) setUrl(toAssetUrl(r.path));
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [item]);

  // 预览区域尺寸：由容器决定，图片按比例缩放到框内
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Esc 取消（基线 §11.1：Esc 优先取消当前编辑）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const nx = (e.clientX - d.left) / d.boxW;
    const ny = (e.clientY - d.top) / d.boxH;
    const next =
      d.mode === "move"
        ? moveCrop(d.start, (e.clientX - d.startX) / d.boxW, (e.clientY - d.startY) / d.boxH)
        : resizeCrop(d.start, d.mode, nx, ny, aspectRef.current);
    setRect(next);
    setDirty(true);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  useEffect(() => () => onPointerUp(), [onPointerUp]);

  function beginDrag(e: React.PointerEvent, mode: "move" | CropHandle) {
    if (e.button !== 0) return;
    const box = canvasRef.current;
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    const b = box.getBoundingClientRect();
    dragRef.current = {
      mode,
      start: rect,
      startX: e.clientX,
      startY: e.clientY,
      left: b.left,
      top: b.top,
      boxW: b.width,
      boxH: b.height,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  if (!inst || !item) return null;

  const scale =
    nat.w > 0 && stage.w > 0 ? Math.min(stage.w / nat.w, stage.h / nat.h) : 0;
  const dispW = Math.max(0, Math.round(nat.w * scale));
  const dispH = Math.max(0, Math.round(nat.h * scale));

  function apply() {
    if (!inst || !item) return;
    if (dirty) {
      const next = toSource(rect, source);
      commit((d) => setCrop(d, inst.id, next, source), { label: "裁剪图片" });
    }
    close();
  }

  function reset() {
    if (!inst || !item) return;
    const full = fullCrop(source.w, source.h);
    commit((d) => setCrop(d, inst.id, full, source), { label: "还原裁剪" });
    setRect(initialCropNorm(coverCrop(full, inst.rotation, inst.frame).crop, source));
    setDirty(false);
  }

  const px = (v: number) => `${v * 100}%`;

  return (
    <div className="crop-overlay" onPointerDown={close}>
      <div className="crop-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="crop-dialog__head">
          <span className="crop-dialog__title">裁剪</span>
          <span className="crop-dialog__meta">
            {item.fileName} · {item.width} × {item.height}
          </span>
          <span className="crop-dialog__spacer" />
          <span className="crop-dialog__meta">
            比例 {aspect >= 1 ? `${aspect.toFixed(2)} : 1` : `1 : ${(1 / aspect).toFixed(2)}`}
            {inst.rotation !== 0 ? ` · 已旋转 ${inst.rotation}°` : ""}
          </span>
        </div>

        <div className="crop-stage" ref={stageRef}>
          {url && dispW > 0 ? (
            <div
              className="crop-canvas"
              ref={canvasRef}
              style={{ width: dispW, height: dispH }}
            >
              <img
                src={url}
                width={dispW}
                height={dispH}
                alt=""
                draggable={false}
                onLoad={(e) =>
                  setNat({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
              />
              <div
                className="crop-shade"
                style={{
                  left: px(rect.x),
                  top: px(rect.y),
                  width: px(rect.w),
                  height: px(rect.h),
                }}
                onPointerDown={(e) => beginDrag(e, "move")}
              />
              {HANDLES.map((k) => (
                <span
                  key={k}
                  className={`crop-handle crop-handle--${k}`}
                  style={{
                    left: px(rect.x + (k.includes("e") ? rect.w : k.includes("w") ? 0 : rect.w / 2)),
                    top: px(rect.y + (k.includes("s") ? rect.h : k.includes("n") ? 0 : rect.h / 2)),
                    cursor: cursorForHandle(k),
                  }}
                  onPointerDown={(e) => beginDrag(e, k)}
                />
              ))}
            </div>
          ) : (
            <div className="crop-loading">正在准备预览…</div>
          )}
        </div>

        <div className="crop-dialog__foot">
          <button onClick={reset}>还原全图</button>
          <span className="crop-dialog__hint">拖动边角调整范围，拖动中间移动选框 · Esc 取消</span>
          <span className="crop-dialog__spacer" />
          <button onClick={close}>取消</button>
          <button className="btn-primary" onClick={apply}>
            应用
          </button>
        </div>
      </div>
    </div>
  );
}
