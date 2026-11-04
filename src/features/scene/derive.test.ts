/**
 * 场景派生的契约测试（不需要 Konva，纯数据）。
 *
 * 这里锁两件用户能直接看到的事：
 * 1. 空槽位的编号就是双击填充的顺序；
 * 2. 实例归属哪一格由实例中心决定（与占位判定方向一致）。
 */
import { describe, expect, it } from "vitest";
import { createInstance } from "../../domain/document";
import { findTemplate, placeIntoCell, templateFrames } from "../../domain/templates";
import { createEmptyDocument, type DocumentState } from "../../domain/types";
import { deriveScene } from "./derive";

const tpl = findTemplate("grid-2x2")!;
const canvas = { width: 1200, height: 800 };

function docWithTemplate(): DocumentState {
  const doc = createEmptyDocument();
  return { ...doc, canvas: { ...doc.canvas, ...canvas }, templateId: tpl.id };
}

function place(doc: DocumentState, cell: number, id: string): DocumentState {
  return placeIntoCell(doc, tpl, cell, { itemId: `item-${id}`, width: 400, height: 300 }, id);
}

describe("空槽位编号", () => {
  it("按格子编号升序编号，从 1 开始", () => {
    const doc = place(docWithTemplate(), 0, "a");
    const scene = deriveScene(doc, {});
    expect(scene.emptyCells.map((c) => c.index)).toEqual([1, 2, 3]);
    expect(scene.emptyCells.map((c) => c.order)).toEqual([1, 2, 3]);
  });

  it("中间格被占用时，编号重排为连续 1..n（不保留原格子号）", () => {
    const doc = place(docWithTemplate(), 1, "b");
    const scene = deriveScene(doc, {});
    // 空的是 0/2/3，编号仍是 1/2/3：用户看到的是"下一个填哪"，不是格子 id
    expect(scene.emptyCells.map((c) => c.index)).toEqual([0, 2, 3]);
    expect(scene.emptyCells.map((c) => c.order)).toEqual([1, 2, 3]);
  });

  it("槽位矩形与模板换算结果一致（编号不会画错位置）", () => {
    const doc = place(docWithTemplate(), 2, "c");
    const frames = templateFrames(tpl, canvas, doc.gap);
    const scene = deriveScene(doc, {});
    for (const cell of scene.emptyCells) {
      expect(cell.frame).toEqual(frames[cell.index]);
    }
  });
});

describe("实例归属单元格", () => {
  it("按实例中心判定：放大后仍归属自己那一格", () => {
    const base = place(docWithTemplate(), 0, "a");
    const inst = base.instances[0];
    const enlarged: DocumentState = {
      ...base,
      instances: [{ ...inst, frame: { x: 20, y: 10, w: 1100, h: 700 } }],
    };
    const scene = deriveScene(enlarged, {});
    const frames = templateFrames(tpl, canvas, 0);
    // 中心 (570, 360) 落在第 0 格 (0..600, 0..400)
    expect(scene.nodes[0].cell).toEqual(frames[0]);
  });

  it("中心移出所有格子时不裁剪（视为已移出模板）", () => {
    const base = place(docWithTemplate(), 0, "a");
    const inst = base.instances[0];
    const moved: DocumentState = {
      ...base,
      instances: [{ ...inst, frame: { x: -900, y: -900, w: 200, h: 200 } }],
    };
    const scene = deriveScene(moved, {});
    expect(scene.nodes[0].cell).toBeUndefined();
  });

  it("无模板时任何实例都没有单元格", () => {
    const doc = createEmptyDocument();
    const withInst: DocumentState = {
      ...doc,
      instances: [
        createInstance(doc, {
          id: "x",
          libraryItemId: "item-x",
          sourceWidth: 400,
          sourceHeight: 300,
          frame: { x: 0, y: 0, w: 400, h: 300 },
        }),
      ],
    };
    const scene = deriveScene(withInst, {});
    expect(scene.nodes[0].cell).toBeUndefined();
  });
});
