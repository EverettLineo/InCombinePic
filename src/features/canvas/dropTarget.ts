/**
 * 画布投放目标（供资源库拖拽使用）。
 *
 * 为什么用模块级注册而不是 props 传递：
 * 拖拽手势在资源库面板里发起，落点判定需要画布容器的几何
 * （host 的 rect + 视图缩放平移）。两者是兄弟组件，
 * 用 context 或全局 store 会让高频的 pointermove 触发整树重渲染。
 *
 * 这里只在挂载时登记一个函数引用，拖拽过程零 React 参与。
 */

export type CanvasDropHandler = (itemId: string, clientX: number, clientY: number) => boolean;

let handler: CanvasDropHandler | null = null;

export function registerCanvasDropTarget(next: CanvasDropHandler | null): void {
  handler = next;
}

/** 尝试投放到画布；没有画布或落点无效时返回 false */
export function dropOnCanvas(itemId: string, clientX: number, clientY: number): boolean {
  return handler ? handler(itemId, clientX, clientY) : false;
}

/** 指针是否落在某元素内（用于拖拽时判断"是否已离开资源库"） */
export function isInside(el: Element | null, clientX: number, clientY: number): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}
