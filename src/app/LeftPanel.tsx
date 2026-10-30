import { useState } from "react";
import { LibraryPanel } from "../features/library/LibraryPanel";
import { TemplatePanel } from "../features/templates/TemplatePanel";

type LeftTab = "library" | "templates";

/**
 * 左侧面板外壳：资源库 / 模板两个标签页。
 *
 * 与右栏同样的理由：标签页是纯界面状态，不入 viewStore，也不进撤销历史。
 */
export function LeftPanel() {
  const [tab, setTab] = useState<LeftTab>("library");

  return (
    <aside className="panel panel--left">
      <div className="panel__tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "library"}
          className={`panel__tab${tab === "library" ? " panel__tab--active" : ""}`}
          onClick={() => setTab("library")}
        >
          资源库
        </button>
        <button
          role="tab"
          aria-selected={tab === "templates"}
          className={`panel__tab${tab === "templates" ? " panel__tab--active" : ""}`}
          onClick={() => setTab("templates")}
        >
          模板
        </button>
      </div>

      {tab === "library" ? <LibraryPanel /> : <TemplatePanel />}
    </aside>
  );
}
