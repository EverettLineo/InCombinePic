import { LibraryPanel } from "../features/library/LibraryPanel";

/**
 * 左侧面板：固定为资源库。
 *
 * 模板作用于整体布局，与属性、图层、画布同属对画布的操作，因此放在右栏。
 */
export function LeftPanel() {
  return (
    <aside className="panel panel--left">
      <div className="panel__title">资源库</div>
      <LibraryPanel />
    </aside>
  );
}
