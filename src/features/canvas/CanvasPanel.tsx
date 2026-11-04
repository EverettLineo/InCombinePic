import {
  CANVAS_PRESETS,
  DEFAULT_GRADIENT,
  normalizeAngle,
  overflowReport,
} from "../../domain/canvas";
import { setBackground, setCanvasSize } from "../../domain/document";
import type { Background } from "../../domain/types";
import { useDocStore } from "../../state/docStore";
import { useViewStore } from "../../state/viewStore";
import { NumberField } from "../../ui/NumberField";

const BG_LABELS: Array<{ type: Background["type"]; label: string; hint: string }> = [
  { type: "white", label: "白色", hint: "默认背景，导出 JPG 时最省事" },
  { type: "solid", label: "纯色", hint: "单色填充，适合纯色底" },
  { type: "transparent", label: "透明", hint: "仅 PNG 可保留透明；预览用棋盘格提示" },
  { type: "linear", label: "渐变", hint: "两色线性渐变，可调方向" },
];

/**
 * 画布面板。
 *
 * 背景与尺寸的每次修改都走 `commit`，因此可撤销。
 * 连续触发的控件（取色器、角度滑块）用 `mergeKey` 合并为一步。
 */
export function CanvasPanel() {
  const doc = useDocStore((s) => s.doc);
  const commit = useDocStore((s) => s.commit);
  const endMerge = useDocStore((s) => s.endMerge);
  const setSelection = useViewStore((s) => s.setSelection);

  const bg = doc.canvas.background;
  const report = overflowReport(doc);

  function changeBackground(next: Background, label: string, mergeKey?: string) {
    commit((d) => setBackground(d, next), { label, mergeKey });
  }

  function pickType(type: Background["type"]) {
    if (type === bg.type) return;
    if (type === "white") return changeBackground({ type: "white" }, "背景：白色");
    if (type === "transparent") return changeBackground({ type: "transparent" }, "背景：透明");
    if (type === "solid") {
      return changeBackground(
        { type: "solid", color: bg.type === "solid" ? bg.color : "#f2f4f8" },
        "背景：纯色",
      );
    }
    return changeBackground(
      {
        type: "linear",
        from: bg.type === "linear" ? bg.from : DEFAULT_GRADIENT.from,
        to: bg.type === "linear" ? bg.to : DEFAULT_GRADIENT.to,
        angle: bg.type === "linear" ? bg.angle : DEFAULT_GRADIENT.angle,
      },
      "背景：渐变",
    );
  }

  function setSize(w: number, h: number, label: string) {
    commit((d) => setCanvasSize(d, w, h), { label });
  }

  const merge = (k: string) => `bg-${k}`;

  return (
    <div className="inspector">
      <div className="inspector__group-title">画布尺寸</div>
      <div className="inspector__row">
        <NumberField
          label="宽"
          value={doc.canvas.width}
          min={64}
          onCommit={(v) => setSize(v, doc.canvas.height, "调整画布尺寸")}
        />
        <NumberField
          label="高"
          value={doc.canvas.height}
          min={64}
          onCommit={(v) => setSize(doc.canvas.width, v, "调整画布尺寸")}
        />
      </div>
      <div className="canvas-presets">
        {CANVAS_PRESETS.map((p) => (
          <button
            key={p.label}
            className={`btn-quiet${
              doc.canvas.width === p.width && doc.canvas.height === p.height
                ? " canvas-presets__active"
                : ""
            }`}
            onClick={() => setSize(p.width, p.height, `画布：${p.label}`)}
            title={`${p.width} × ${p.height}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="inspector__hint">只改边界，不移动或缩放已有图片；越界部分在视图与导出中都会被裁切</div>

      <div className="inspector__group-title">背景</div>
      <div className="bg-types">
        {BG_LABELS.map((b) => (
          <button
            key={b.type}
            className={`btn-quiet${bg.type === b.type ? " bg-types__active" : ""}`}
            onClick={() => pickType(b.type)}
            title={b.hint}
          >
            {b.label}
          </button>
        ))}
      </div>

      {bg.type === "solid" ? (
        <div className="inspector__row">
          <label className="field">
            <span className="field__label">色</span>
            <input
              className="field__color"
              type="color"
              value={bg.color}
              onChange={(e) =>
                changeBackground({ type: "solid", color: e.target.value }, "背景颜色", merge("solid"))
              }
              onBlur={endMerge}
              aria-label="背景颜色"
            />
          </label>
        </div>
      ) : null}

      {bg.type === "linear" ? (
        <>
          <div className="inspector__row">
            <label className="field">
              <span className="field__label">起</span>
              <input
                className="field__color"
                type="color"
                value={bg.from}
                onChange={(e) =>
                  changeBackground(
                    { ...bg, from: e.target.value },
                    "渐变起色",
                    merge("grad-from"),
                  )
                }
                onBlur={endMerge}
                aria-label="渐变起色"
              />
            </label>
            <label className="field">
              <span className="field__label">止</span>
              <input
                className="field__color"
                type="color"
                value={bg.to}
                onChange={(e) =>
                  changeBackground({ ...bg, to: e.target.value }, "渐变止色", merge("grad-to"))
                }
                onBlur={endMerge}
                aria-label="渐变止色"
              />
            </label>
          </div>
          <div className="inspector__row inspector__row--slider">
            <span className="field__label">角</span>
            <input
              type="range"
              min={0}
              max={359}
              step={1}
              value={bg.angle}
              onChange={(e) =>
                changeBackground(
                  { ...bg, angle: normalizeAngle(Number(e.target.value)) },
                  "渐变方向",
                  merge("grad-angle"),
                )
              }
              onPointerUp={endMerge}
              onKeyUp={endMerge}
              aria-label="渐变方向"
            />
            <span className="inspector__value">{Math.round(bg.angle)}°</span>
          </div>
          <div className="inspector__hint">0° 从左到右，90° 从上到下</div>
        </>
      ) : null}

      {bg.type === "transparent" ? (
        <div className="inspector__hint">棋盘格只是透明的预览提示，不会被导出</div>
      ) : null}

      <div className="inspector__group-title">内容与边界</div>
      {report.count > 0 ? (
        <>
          <div className="overflow-note">
            <strong>{report.count} 张图片超出画布</strong>
            <div>
              左 {Math.round(report.left)} · 上 {Math.round(report.top)} · 右{" "}
              {Math.round(report.right)} · 下 {Math.round(report.bottom)} px
            </div>
            <div>导出时这些部分会被裁掉，画布不会自动扩张</div>
          </div>
          <div className="inspector__row">
            <button
              className="btn-quiet"
              onClick={() => setSelection(report.ids)}
              title="选中所有越界的图片，便于调整"
            >
              选中越界图片
            </button>
          </div>
        </>
      ) : (
        <div className="inspector__hint">全部内容都在画布内</div>
      )}
    </div>
  );
}
