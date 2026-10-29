import { useState } from "react";
import { AlignBar } from "../features/layers/AlignBar";
import { LayerPanel } from "../features/layers/LayerPanel";
import { InspectorPanel } from "../features/inspector/InspectorPanel";

type RightTab = "props" | "layers";

/**
 * 右侧面板外壳：属性 / 图层两个标签页 + 多选编排条。
 *
 * 标签页状态是纯界面状态，不入 viewStore：viewStore 承载的是缩放/平移/选中
 * 这类与画布内容对应的状态，面板开合与之无关，放进去只会让撤销与持久化的
 * 边界判断更难写。
 */
export function RightPanel() {
  const [tab, setTab] = useState<RightTab>("props");

  return (
    <aside className="panel panel--right">
      <div className="panel__tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "props"}
          className={`panel__tab${tab === "props" ? " panel__tab--active" : ""}`}
          onClick={() => setTab("props")}
        >
          属性
        </button>
        <button
          role="tab"
          aria-selected={tab === "layers"}
          className={`panel__tab${tab === "layers" ? " panel__tab--active" : ""}`}
          onClick={() => setTab("layers")}
        >
          图层
        </button>
      </div>

      <AlignBar />

      <div className="panel__body">
        {tab === "props" ? <InspectorPanel /> : <LayerPanel />}
      </div>
    </aside>
  );
}
