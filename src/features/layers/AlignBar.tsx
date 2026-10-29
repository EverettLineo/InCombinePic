import { alignInstances, distributeInstances, type AlignMode, type DistributeAxis } from "../../domain/align";
import { removeInstances } from "../../domain/document";
import { useDocStore } from "../../state/docStore";
import { useViewStore } from "../../state/viewStore";

interface AlignButton {
  mode: AlignMode;
  label: string;
  glyph: string;
  title: string;
}

const H_BUTTONS: AlignButton[] = [
  { mode: "left", label: "左", glyph: "⇤", title: "左对齐（以选中范围的左边缘为准）" },
  { mode: "hcenter", label: "中", glyph: "↔", title: "水平居中（以选中范围的中心为准）" },
  { mode: "right", label: "右", glyph: "⇥", title: "右对齐（以选中范围的右边缘为准）" },
];

const V_BUTTONS: AlignButton[] = [
  { mode: "top", label: "上", glyph: "⇡", title: "上对齐（以选中范围的上边缘为准）" },
  { mode: "vcenter", label: "中", glyph: "↕", title: "垂直居中（以选中范围的中心为准）" },
  { mode: "bottom", label: "下", glyph: "⇣", title: "下对齐（以选中范围的底边缘为准）" },
];

const DIST_BUTTONS: Array<{ axis: DistributeAxis; label: string; title: string }> = [
  {
    axis: "horizontal",
    label: "横向等距",
    title: "水平等间距分布（首尾不动，需选中 3 个及以上）",
  },
  {
    axis: "vertical",
    label: "纵向等距",
    title: "垂直等间距分布（首尾不动，需选中 3 个及以上）",
  },
];

/**
 * 多选编排条（T6.2 / T6.4）。
 *
 * 只在选中 2 个及以上对象时出现：单选对齐没有语义（对齐基准是选中范围本身），
 * 与其显示一排永远灰着的按钮，不如不出现。
 */
export function AlignBar() {
  const selection = useViewStore((s) => s.selection);
  const setSelection = useViewStore((s) => s.setSelection);
  const commit = useDocStore((s) => s.commit);

  if (selection.length < 2) return null;

  const canDistribute = selection.length >= 3;

  function runAlign(mode: AlignMode, label: string) {
    const ids = selection.slice();
    commit((d) => alignInstances(d, ids, mode), { label });
  }

  function runDistribute(axis: DistributeAxis, label: string) {
    const ids = selection.slice();
    commit((d) => distributeInstances(d, ids, axis), { label });
  }

  function runDelete() {
    const ids = selection.slice();
    commit((d) => removeInstances(d, ids), { label: "删除选中对象" });
    setSelection([]);
  }

  return (
    <div className="align-bar">
      <div className="align-bar__title">多选编排 · 已选 {selection.length} 个</div>

      <div className="align-bar__grid">
        {H_BUTTONS.map((b) => (
          <button
            key={`h-${b.mode}`}
            onClick={() => runAlign(b.mode, b.title.split("（")[0])}
            title={b.title}
          >
            <span className="align-bar__glyph">{b.glyph}</span>
            {b.label}
          </button>
        ))}
        {V_BUTTONS.map((b) => (
          <button
            key={`v-${b.mode}`}
            onClick={() => runAlign(b.mode, b.title.split("（")[0])}
            title={b.title}
          >
            <span className="align-bar__glyph">{b.glyph}</span>
            {b.label}
          </button>
        ))}
      </div>

      <div className="align-bar__grid align-bar__grid--two">
        {DIST_BUTTONS.map((b) => (
          <button
            key={b.axis}
            disabled={!canDistribute}
            onClick={() => runDistribute(b.axis, b.label)}
            title={b.title}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="align-bar__foot">
        <span className="align-bar__hint">
          {canDistribute ? "对齐以选中范围为基准" : "等距分布需选中 3 个及以上"}
        </span>
        <button
          className="btn-quiet align-bar__delete"
          onClick={runDelete}
          title="删除选中对象（可撤销）"
        >
          删除
        </button>
      </div>
    </div>
  );
}
