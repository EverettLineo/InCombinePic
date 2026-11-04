/**
 * 把资源库条目放到画布上。
 *
 * 这里只负责"几何 + 文档提交"，不接触渲染。
 * 放置属于可撤销的画布编辑，因此走 docStore.commit。
 */

import { addInstance, createInstance, hitTest, makeInstanceId } from "../../domain/document";
import { cascadeFrame, gridFrames } from "../../domain/layout";
import {
  emptyCellIndices,
  findTemplate,
  placeIntoCell,
  replaceInstanceSource,
  templateFrames,
} from "../../domain/templates";
import type { LibraryItem } from "../../domain/types";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";
import { useViewStore } from "../../state/viewStore";

/** 单个资源放置到画布中央（落点需避让已有内容） */
export function placeItem(item: LibraryItem): string | null {
  const { commit } = useDocStore.getState();
  let createdId: string | null = null;

  commit((doc) => {
    // 模板模式下优先填第一个空格：用户的意图是"补满模板"，而不是"盖在中间"
    const template = findTemplate(doc.templateId);
    if (template) {
      const empties = emptyCellIndices(doc, template);
      if (empties.length > 0) {
        const next = placeIntoCell(
          doc,
          template,
          empties[0],
          { itemId: item.id, width: item.width, height: item.height },
          makeInstanceId(empties[0]),
        );
        createdId = next.instances[next.instances.length - 1].id;
        return next;
      }
    }

    // 已有内容时缩到 70% 并斜向错开，否则新图会完全盖在旧图下面，看起来像没有响应
    const frame = cascadeFrame(
      { width: item.width, height: item.height },
      { width: doc.canvas.width, height: doc.canvas.height },
      doc.instances.map((i) => i.frame),
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

/** 把资源库当前顺序的全部图片一次性铺到画布 */
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

let dropSeq = 0;
function nextDropId(): string {
  dropSeq += 1;
  return `drop-${Date.now().toString(36)}-${dropSeq}`;
}

/** 拖放放置时，图片相对画布宽度的默认占比 */
const DROP_WIDTH_RATIO = 0.4;

/**
 * 拖拽投放（资源库 → 画布）。落点决定行为，三档优先级：
 *
 * 1. 模板空格：落点在空白单元格内，填入该格；
 * 2. 已有实例：落点压在某张图上，替换其图片，位置、边框、圆角保留，裁剪重置；
 * 3. 空白处：以落点为中心按比例放置，并夹回画布内。
 *
 * 返回是否真的发生了编辑，供调用方决定是否给出提示。
 */
export function dropItemAt(item: LibraryItem, x: number, y: number): boolean {
  const { commit } = useDocStore.getState();
  let placed = false;

  commit((doc) => {
    const src = { itemId: item.id, width: item.width, height: item.height };
    const template = findTemplate(doc.templateId);

    if (template) {
      const frames = templateFrames(template, doc.canvas, doc.gap);
      const cell = emptyCellIndices(doc, template).find((i) => {
        const f = frames[i];
        return x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;
      });
      if (cell !== undefined) {
        placed = true;
        return placeIntoCell(doc, template, cell, src, makeInstanceId(cell));
      }
    }

    const hit = hitTest(doc, x, y);
    if (hit) {
      placed = true;
      return replaceInstanceSource(doc, hit, src);
    }

    // 空白处：按比例放置，宽度取画布宽度的 40%，再按图片宽高比算高度
    const w = Math.max(24, Math.round(doc.canvas.width * DROP_WIDTH_RATIO));
    const h = Math.max(24, Math.round((w * item.height) / Math.max(1, item.width)));
    const frame = {
      x: Math.round(x - w / 2),
      y: Math.round(y - h / 2),
      w,
      h,
    };
    placed = true;
    const instance = createInstance(doc, {
      // 独立前缀 + 自增：避免与模板/双击路径的 id 规则撞车
      id: nextDropId(),
      libraryItemId: item.id,
      sourceWidth: item.width,
      sourceHeight: item.height,
      frame,
    });
    return addInstance(doc, instance);
  });

  return placed;
}
