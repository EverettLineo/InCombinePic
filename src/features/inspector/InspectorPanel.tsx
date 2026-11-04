import { fullCrop, setCrop, updateInstance } from "../../domain/document";
import type { CanvasInstance, Id } from "../../domain/types";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";
import { useViewStore } from "../../state/viewStore";
import { NumberField } from "../../ui/NumberField";

/**
 * 右侧属性面板内容。
 * 容器与标签页由 app/RightPanel 提供；本组件只负责内容。
 *
 * 所有修改都走 `commit`，因此天然进撤销栈。
 * 滑块与取色器连续触发，用 `mergeKey` 合并为一步，松手/失焦时 `endMerge`。
 */
export function InspectorPanel() {
  const doc = useDocStore((s) => s.doc);
  const selection = useViewStore((s) => s.selection);
  const openCropEditor = useViewStore((s) => s.openCropEditor);
  const openReplacePicker = useViewStore((s) => s.openReplacePicker);
  const commit = useDocStore((s) => s.commit);
  const endMerge = useDocStore((s) => s.endMerge);
  const findItem = useLibraryStore((s) => s.findById);

  const singleId: Id | null = selection.length === 1 ? selection[0] : null;
  const single: CanvasInstance | undefined = singleId
    ? doc.instances.find((i) => i.id === singleId)
    : undefined;

  if (!single) {
    return (
      <div className="empty-hint">
        {selection.length > 1
          ? `已选中 ${selection.length} 个对象，数值编辑仅支持单选；可用上方编排条对齐或分布`
          : doc.instances.length > 0
            ? "未选中对象 · 点击画布中的图片进行编辑"
            : "画布为空，先从左侧导入图片"}
      </div>
    );
  }

  const inst = single;
  const item = findItem(inst.libraryItemId);
  const source = { w: item?.width ?? 1, h: item?.height ?? 1 };

  function patch(props: Partial<Omit<CanvasInstance, "id">>, label: string, mergeKey?: string) {
    commit((d) => updateInstance(d, inst.id, props), { label, mergeKey });
  }

  function patchFrame(part: "x" | "y" | "w" | "h", v: number) {
    const isSize = part === "w" || part === "h";
    patch(
      { frame: { ...inst.frame, [part]: Math.max(isSize ? 1 : 0, v) } },
      isSize ? "调整尺寸" : "调整位置",
    );
  }

  function patchCrop(part: "x" | "y" | "w" | "h", v: number) {
    commit((d) => setCrop(d, inst.id, { ...inst.crop, [part]: v }, source), {
      label: "裁剪数值",
    });
  }

  function resetCrop() {
    const full = fullCrop(source.w, source.h);
    commit((d) => setCrop(d, inst.id, full, source), { label: "还原裁剪" });
  }

  const opacityPct = Math.round(inst.opacity * 100);
  const merge = (k: string) => `${k}:${inst.id}`;

  return (
    <div className="inspector">
      <div className="inspector__group-title">位置与尺寸</div>
      <div className="inspector__row">
        <NumberField label="X" value={inst.frame.x} onCommit={(v) => patchFrame("x", v)} />
        <NumberField label="Y" value={inst.frame.y} onCommit={(v) => patchFrame("y", v)} />
      </div>
      <div className="inspector__row">
        <NumberField label="宽" value={inst.frame.w} min={1} onCommit={(v) => patchFrame("w", v)} />
        <NumberField label="高" value={inst.frame.h} min={1} onCommit={(v) => patchFrame("h", v)} />
      </div>

      <div className="inspector__group-title">裁剪（源图像素）</div>
      <div className="inspector__row">
        <NumberField label="X" value={Math.round(inst.crop.x)} onCommit={(v) => patchCrop("x", v)} />
        <NumberField label="Y" value={Math.round(inst.crop.y)} onCommit={(v) => patchCrop("y", v)} />
      </div>
      <div className="inspector__row">
        <NumberField label="宽" value={Math.round(inst.crop.w)} min={1} onCommit={(v) => patchCrop("w", v)} />
        <NumberField label="高" value={Math.round(inst.crop.h)} min={1} onCommit={(v) => patchCrop("h", v)} />
      </div>
      <div className="inspector__row">
        <button className="btn-quiet" onClick={() => openCropEditor(inst.id)}>
          在图中框选裁剪
        </button>
        <button className="btn-quiet" onClick={resetCrop} title="把裁剪恢复为整张源图">
          还原全图
        </button>
      </div>
      <div className="inspector__row">
        <button
          className="btn-quiet"
          onClick={() => openReplacePicker(inst.id)}
          title="用资源库里的另一张图替换（位置与外观保留，裁剪重置）"
        >
          替换图片…
        </button>
      </div>
      <div className="inspector__hint">裁剪只记录源图区域，不改动原文件</div>

      <div className="inspector__group-title">不透明度</div>
      <div className="inspector__row inspector__row--slider">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={opacityPct}
          onChange={(e) =>
            patch({ opacity: Number(e.target.value) / 100 }, "调整不透明度", merge("opacity"))
          }
          onPointerUp={endMerge}
          onKeyUp={endMerge}
          aria-label="不透明度"
        />
        <span className="inspector__value">{opacityPct}%</span>
      </div>
      <div className="inspector__row">
        <NumberField
          label="值"
          value={opacityPct}
          min={0}
          onCommit={(v) => patch({ opacity: Math.min(100, v) / 100 }, "调整不透明度")}
        />
        <span className="inspector__hint inspector__hint--inline">0 ~ 100 %</span>
      </div>

      <div className="inspector__group-title">边框与圆角</div>
      <div className="inspector__row">
        <NumberField
          label="粗"
          value={inst.border.width}
          min={0}
          onCommit={(v) => patch({ border: { ...inst.border, width: v } }, "调整边框")}
        />
        <label className="field">
          <span className="field__label">色</span>
          <input
            className="field__color"
            type="color"
            value={inst.border.color}
            onChange={(e) =>
              patch(
                { border: { ...inst.border, color: e.target.value } },
                "边框颜色",
                merge("bcolor"),
              )
            }
            onBlur={endMerge}
            aria-label="边框颜色"
          />
        </label>
      </div>
      <div className="inspector__row">
        <NumberField
          label="圆"
          value={inst.cornerRadius}
          min={0}
          onCommit={(v) => patch({ cornerRadius: v }, "调整圆角")}
        />
        <span className="inspector__hint inspector__hint--inline">0 = 无边框 / 直角</span>
      </div>
      <div className="inspector__hint">单位：画图像素；修改立即生效，可撤销</div>
    </div>
  );
}
