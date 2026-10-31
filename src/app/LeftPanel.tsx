import { LibraryPanel } from "../features/library/LibraryPanel";

/**
 * 左侧面板：固定为资源库。
 *
 * 模板曾在这里与资源库并列，现已移到右栏——模板改变的是整体布局，
 * 属于"对整个画布的操作"，和属性/图层/画布同类，放在右栏更符合心智。
 */
export function LeftPanel() {
  return (
    <aside className="panel panel--left">
      <div className="panel__title">资源库</div>
      <LibraryPanel />
    </aside>
  );
}
