import { useState } from "react";
import {
  applyTemplate,
  CATEGORY_LABELS,
  fillSourcesOf,
  findTemplate,
  TEMPLATES,
  type TemplateCategory,
  type TemplateDef,
} from "../../domain/templates";
import { makeInstanceId, setFitMode, setGap, setTemplate } from "../../domain/document";
import type { FitMode } from "../../domain/types";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";

const CATEGORY_ORDER: TemplateCategory[] = ["grid", "long", "columns", "asymmetric", "wall"];

const FIT_LABELS: Record<FitMode, string> = {
  fill: "填满单元格",
  contain: "完整显示",
};

/** 模板缩略图：用 div 画单元格，不依赖图片资源 */
function TemplateThumb({ t }: { t: TemplateDef }) {
  return (
    <div className="tpl-thumb" aria-hidden>
      {t.cells.map((c, i) => (
        <span
          key={i}
          style={{
            left: `${c.x * 100}%`,
            top: `${c.y * 100}%`,
            width: `${c.w * 100}%`,
            height: `${c.h * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * 模板面板。
 *
 * 切换模板直接走 `commit`：整个重排是一个快照，天然满足"原子撤销"。
 * 不做二次确认——有撤销兜底，加确认只会让试模板变慢。
 */
export function TemplatePanel() {
  const doc = useDocStore((s) => s.doc);
  const commit = useDocStore((s) => s.commit);
  const getSorted = useLibraryStore((s) => s.getSorted);
  const [error, setError] = useState<string | null>(null);

  const current = findTemplate(doc.templateId);
  const itemCount = useLibraryStore((s) => s.items.length);

  function apply(t: TemplateDef) {
    const items = getSorted();
    if (items.length === 0) {
      setError("资源库为空，先导入图片再套用模板");
      return;
    }
    setError(null);
    const sources = fillSourcesOf(items);
    commit(
      (d) =>
        applyTemplate(d, t, sources, (i) => makeInstanceId(i)),
      { label: `应用模板：${t.name}` },
    );
  }

  function changeFit(mode: FitMode) {
    commit((d) => setFitMode(d, mode), { label: "切换适配模式" });
  }

  function changeGap(v: number) {
    commit((d) => setGap(d, v), { label: "调整间距", mergeKey: "tpl-gap" });
  }

  function leaveTemplate() {
    commit((d) => setTemplate(d, null), { label: "退出模板" });
  }

  return (
    <>
      <div className="lib-toolbar">
        <span className="lib-toolbar__meta">
          {current ? `当前：${current.name}（${current.cells.length} 格）` : "当前：自由布局"}
        </span>
        <span className="lib-toolbar__spacer" />
        {current ? (
          <button className="btn-quiet" onClick={leaveTemplate} title="保留当前排布，转为自由布局">
            退出模板
          </button>
        ) : null}
      </div>

      <div className="tpl-controls">
        <label className="tpl-control">
          <span>适配</span>
          <select
            value={doc.fitMode}
            onChange={(e) => changeFit(e.target.value as FitMode)}
            title="填满会裁切图片，完整显示会露出背景"
          >
            {(Object.keys(FIT_LABELS) as FitMode[]).map((m) => (
              <option key={m} value={m}>
                {FIT_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="tpl-control">
          <span>间距</span>
          <input
            type="range"
            min={0}
            max={64}
            step={2}
            value={doc.gap}
            onChange={(e) => changeGap(Number(e.target.value))}
            onPointerUp={() => useDocStore.getState().endMerge()}
            onKeyUp={() => useDocStore.getState().endMerge()}
          />
          <span className="tpl-control__value">{doc.gap}</span>
        </label>
      </div>

      {error ? <div className="report report--error">{error}</div> : null}
      {itemCount === 0 ? (
        <div className="lib-hint">资源库为空：模板可以套用，但所有格子会是空的</div>
      ) : null}

      <div className="panel__body panel__body--list">
        {CATEGORY_ORDER.map((cat) => (
          <div key={cat} className="tpl-group">
            <div className="tpl-group__title">{CATEGORY_LABELS[cat]}</div>
            <div className="tpl-grid">
              {TEMPLATES.filter((t) => t.category === cat).map((t) => (
                <button
                  key={t.id}
                  className={`tpl-item${doc.templateId === t.id ? " tpl-item--active" : ""}`}
                  onClick={() => apply(t)}
                  title={`${t.name} · ${t.cells.length} 格`}
                >
                  <TemplateThumb t={t} />
                  <span className="tpl-item__name">{t.name}</span>
                  <span className="tpl-item__count">{t.cells.length} 格</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
