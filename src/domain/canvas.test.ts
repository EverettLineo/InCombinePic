import { describe, expect, it } from "vitest";
import {
  contentBounds,
  isOverflowing,
  normalizeAngle,
  overflowingIds,
  overflowReport,
} from "./canvas";
import { createEmptyDocument, type CanvasInstance, type DocumentState } from "./types";

function inst(id: string, x: number, y: number, w: number, h: number): CanvasInstance {
  return {
    id,
    libraryItemId: "lib-1",
    createdSeq: 0,
    frame: { x, y, w, h },
    crop: { x: 0, y: 0, w: 100, h: 100 },
    rotation: 0,
    flipH: false,
    flipV: false,
    opacity: 1,
    border: { width: 0, color: "#000000" },
    cornerRadius: 0,
  };
}

function docOf(list: CanvasInstance[]): DocumentState {
  const base = createEmptyDocument();
  return { ...base, canvas: { ...base.canvas, width: 1000, height: 800 }, instances: list };
}

describe("contentBounds", () => {
  it("取全部实例的并集", () => {
    const doc = docOf([inst("a", 10, 20, 100, 50), inst("b", 300, 5, 40, 200)]);
    expect(contentBounds(doc)).toEqual({ x: 10, y: 5, w: 330, h: 200 });
  });

  it("无实例返回 null", () => {
    expect(contentBounds(docOf([]))).toBeNull();
  });
});

describe("isOverflowing / overflowingIds", () => {
  it("完全在画布内不算溢出", () => {
    const doc = docOf([]);
    expect(isOverflowing(doc, { x: 0, y: 0, w: 1000, h: 800 })).toBe(false);
  });

  it("贴边不算溢出（边界本身就是合法的）", () => {
    const doc = docOf([]);
    expect(isOverflowing(doc, { x: 0, y: 0, w: 500, h: 400 })).toBe(false);
    expect(isOverflowing(doc, { x: 500, y: 400, w: 500, h: 400 })).toBe(false);
  });

  it("任一边越界即算溢出", () => {
    const doc = docOf([]);
    expect(isOverflowing(doc, { x: -1, y: 0, w: 100, h: 100 })).toBe(true);
    expect(isOverflowing(doc, { x: 0, y: -1, w: 100, h: 100 })).toBe(true);
    expect(isOverflowing(doc, { x: 950, y: 0, w: 100, h: 100 })).toBe(true);
    expect(isOverflowing(doc, { x: 0, y: 750, w: 100, h: 100 })).toBe(true);
  });

  it("按图层顺序返回越界实例 id", () => {
    const doc = docOf([
      inst("in", 100, 100, 100, 100),
      inst("left", -20, 100, 100, 100),
      inst("both", 950, 750, 200, 200),
    ]);
    expect(overflowingIds(doc)).toEqual(["left", "both"]);
  });
});

describe("overflowReport", () => {
  it("报告数量与四向最大溢出量", () => {
    const doc = docOf([
      inst("a", -30, 10, 100, 100), // 左溢出 30
      inst("b", 950, -12, 100, 100), // 右溢出 50，上溢出 12
      inst("c", 100, 100, 50, 50), // 不溢出
    ]);
    const r = overflowReport(doc);
    expect(r.count).toBe(2);
    expect(r.ids).toEqual(["a", "b"]);
    expect(r.left).toBe(30);
    expect(r.right).toBe(50);
    expect(r.top).toBe(12);
    expect(r.bottom).toBe(0);
  });

  it("无溢出时全部为 0", () => {
    const r = overflowReport(docOf([inst("a", 0, 0, 100, 100)]));
    expect(r).toEqual({ count: 0, ids: [], left: 0, top: 0, right: 0, bottom: 0 });
  });
});

describe("normalizeAngle", () => {
  it("负值与超过 360 的值折回 [0,360)", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(Number.NaN)).toBe(0);
  });
});
