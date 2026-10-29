/**
 * 把资源库条目放到画布上。
 *
 * 这里只负责"几何 + 文档提交"，不接触渲染。
 * 放置属于可撤销的画布编辑（基线 §11.2），因此走 docStore.commit。
 */

import { addInstance, createInstance, makeInstanceId } from "../../domain/document";
import { centerFitFrame, gridFrames } from "../../domain/layout";
import type { LibraryItem } from "../../domain/types";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";
import { useViewStore } from "../../state/viewStore";

/** 单个资源放置到画布中央（T5.2 的起点；避让已有内容留到 T5.2 完善） */
export function placeItem(item: LibraryItem): string | null {
  const { commit } = useDocStore.getState();
  let createdId: string | null = null;

  commit((doc) => {
    const frame = centerFitFrame(
      { width: item.width, height: item.height },
      { width: doc.canvas.width, height: doc.canvas.height },
    );
    if (frame.w <= 0 || frame.h <= 0) return doc;

    const instance = createInstance(doc, {
      id: makeInstanceId(doc.instances.length + doc.instances.reduce((s, i) => s + i.createdSeq, 0)),
      libraryItemId: item.id,
      sourceWidth: item.width,
      sourceHeight: item.height,
      frame,
    });
    createdId = instance.id;
    return addInstance(doc, instance);
  });

  if (createdId) useViewStore.getState().setSelection([createdId]);
  return createdId;
}

/** 把资源库当前顺序的全部图片一次性铺到画布（基线 §7.1 初始布局） */
export function placeAllItems(): number {
  const items = useLibraryStore.getState().getSorted();
  if (items.length === 0) return 0;

  const { commit } = useDocStore.getState();
  let added = 0;

  commit((doc) => {
    // 几何必须在 recipe 内基于最新文档计算，避免闭包拿到过期画布尺寸
    const frames = gridFrames(
      items.map((i) => ({ width: i.width, height: i.height })),
      { width: doc.canvas.width, height: doc.canvas.height },
      24,
    );

    let next = doc;
    items.forEach((item, index) => {
      const frame = frames[index];
      if (!frame || frame.w <= 0 || frame.h <= 0) return;
      const instance = createInstance(next, {
        id: makeInstanceId(next.instances.length * 1000 + index),
        libraryItemId: item.id,
        sourceWidth: item.width,
        sourceHeight: item.height,
        frame,
      });
      next = addInstance(next, instance);
      added += 1;
    });
    return next;
  });

  return added;
}
