import { updateInstance } from "../../domain/document";
import type { CanvasInstance, Id } from "../../domain/types";
import { useDocStore } from "../../state/docStore";
import { useViewStore } from "../../state/viewStore";
import { NumberField } from "../../ui/NumberField";

/**
 * 右侧属性面板（T5.5 数值编辑部分）。
 * 单选显示 X/Y/W/H；多选或未选中时给出对应提示。
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
    const label = part === "w" || part === "h" ? "调整尺寸" : "调整位置";
    commit(
      (d) =>
        updateInstance(d, single.id, {
          frame: { ...single.frame, [part]: Math.max(part === "w" || part === "h" ? 1 : 0, v) },
        }),
      { label },
    );
  }

  return (
    <aside className="panel panel--right">
      <div className="panel__title">属性 / 图层</div>
      <div className="panel__body">
        {single ? (
          <div className="inspector">
            <div className="inspector__row">
              <NumberField label="X" value={single.frame.x} onCommit={(v) => patchFrame("x", v)} />
              <NumberField label="Y" value={single.frame.y} onCommit={(v) => patchFrame("y", v)} />
            </div>
            <div className="inspector__row">
              <NumberField
                label="宽"
                value={single.frame.w}
                min={1}
                onCommit={(v) => patchFrame("w", v)}
              />
              <NumberField
                label="高"
                value={single.frame.h}
                min={1}
                onCommit={(v) => patchFrame("h", v)}
              />
            </div>
            <div className="inspector__hint">单位：画图像素；修改立即生效，可撤销</div>
          </div>
        ) : selection.length > 1 ? (
          <div className="empty-hint">已选中 {selection.length} 个对象，数值编辑仅支持单选</div>
        ) : doc.instances.length > 0 ? (
          <div className="empty-hint">
            未选中对象 · 共 {doc.instances.length} 个实例
            <br />
            点击画布中的图片进行编辑，Delete 删除选中
          </div>
        ) : (
          <div className="empty-hint">画布为空</div>
        )}
      </div>
    </aside>
  );
}
