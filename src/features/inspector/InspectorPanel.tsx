import { updateInstance } from "../../domain/document";
import type { CanvasInstance, Id } from "../../domain/types";
import { useDocStore } from "../../state/docStore";
import { useViewStore } from "../../state/viewStore";
import { NumberField } from "../../ui/NumberField";

/**
 * 右侧属性面板内容（T5.5 数值编辑）。
 * 容器与标签页由 app/RightPanel 提供；本组件只负责内容。
 * 裁剪、透明度、边框等属性在 P7 加入。
 */
export function InspectorPanel() {
  const doc = useDocStore((s) => s.doc);
  const selection = useViewStore((s) => s.selection);
  const commit = useDocStore((s) => s.commit);

  const singleId: Id | null = selection.length === 1 ? selection[0] : null;
  const single: CanvasInstance | undefined = singleId
    ? doc.instances.find((i) => i.id === singleId)
    : undefined;

  function patchFrame(part: "x" | "y" | "w" | "h", v: number) {
    if (!single) return;
    const isSize = part === "w" || part === "h";
    commit(
      (d) =>
        updateInstance(d, single.id, {
          frame: { ...single.frame, [part]: Math.max(isSize ? 1 : 0, v) },
        }),
      { label: isSize ? "调整尺寸" : "调整位置" },
    );
  }

  if (single) {
    return (
      <div className="inspector">
        <div className="inspector__group-title">位置与尺寸</div>
        <div className="inspector__row">
          <NumberField label="X" value={single.frame.x} onCommit={(v) => patchFrame("x", v)} />
          <NumberField label="Y" value={single.frame.y} onCommit={(v) => patchFrame("y", v)} />
        </div>
        <div className="inspector__row">
          <NumberField label="宽" value={single.frame.w} min={1} onCommit={(v) => patchFrame("w", v)} />
          <NumberField label="高" value={single.frame.h} min={1} onCommit={(v) => patchFrame("h", v)} />
        </div>
        <div className="inspector__hint">单位：画图像素；修改立即生效，可撤销</div>
      </div>
    );
  }

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
