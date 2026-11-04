import { describe, expect, it } from "vitest";
import { snapMove } from "./snap";
import { createEmptyDocument, type CanvasInstance, type DocumentState, type Frame } from "./types";

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

/** 画布 1000×800，便于用整数心算 */
function docOf(instances: CanvasInstance[]): DocumentState {
  const base = createEmptyDocument();
  return { ...base, canvas: { ...base.canvas, width: 1000, height: 800 }, instances };
}

const f = (x: number, y: number, w: number, h: number): Frame => ({ x, y, w, h });

describe("snapMove", () => {
  it("左边缘靠近画布左边界时吸附到 0", () => {
    const doc = docOf([]);
    const r = snapMove(doc, ["a"], [f(3, 100, 200, 150)], 0, 0, 6);
    expect(r.dx).toBe(-3);
    expect(r.guides).toContainEqual({ axis: "x", position: 0, start: 0, end: 800 });
  });

  it("超出阈值不吸附，也不产生辅助线", () => {
    const doc = docOf([]);
    const r = snapMove(doc, ["a"], [f(40, 100, 200, 150)], 0, 0, 6);
    expect(r.dx).toBe(0);
    expect(r.guides).toEqual([]);
  });

  it("中心线吸附到画布中线", () => {
    const doc = docOf([]);
    // 包围盒宽 200、左边缘 397 → 中心 497，画布中线 500
    const r = snapMove(doc, ["a"], [f(397, 100, 200, 100)], 0, 0, 6);
    expect(r.dx).toBe(3);
  });

  it("吸附到其他图片的右边缘", () => {
    const doc = docOf([inst("other", 100, 0, 50, 50)]);
    const r = snapMove(doc, ["a"], [f(148, 300, 100, 100)], 0, 0, 6);
    expect(r.dx).toBe(2);
    expect(r.guides.some((g) => g.axis === "x" && g.position === 150)).toBe(true);
  });

  it("移动中的对象不把自己当作吸附基准", () => {
    // 文档里 a 仍在旧位置 100；若把自己算进基准，会吸附到自己的旧边
    const doc = docOf([inst("a", 100, 100, 100, 100)]);
    const r = snapMove(doc, ["a"], [f(100, 100, 100, 100)], 0, 0, 6);
    expect(r.guides).toEqual([]);
  });

  it("多选时以包围盒吸附，整体平移、相对位置不变", () => {
    const doc = docOf([]);
    const frames = [f(3, 100, 100, 100), f(103, 300, 100, 100)];
    const r = snapMove(doc, ["a", "b"], frames, 0, 0, 6);
    // 包围盒左边缘 3 → 0，整体左移 3
    expect(r.dx).toBe(-3);
    expect(r.dy).toBe(0);
  });

  it("threshold=0 时完全禁用吸附（按住 Alt 临时关闭）", () => {
    const doc = docOf([]);
    const r = snapMove(doc, ["a"], [f(3, 100, 200, 150)], 0, 0, 0);
    expect(r.dx).toBe(0);
    expect(r.guides).toEqual([]);
  });

  it("辅助线覆盖移动对象与基准对象两者的范围", () => {
    const doc = docOf([inst("other", 300, 0, 100, 50)]);
    const r = snapMove(doc, ["a"], [f(302, 400, 100, 100)], 0, 0, 6);
    const g = r.guides.find((x) => x.axis === "x" && x.position === 300);
    expect(g).toBeDefined();
    expect(g!.start).toBe(0);
    expect(g!.end).toBe(500);
  });

  it("位移参数与吸附修正叠加，而不是覆盖", () => {
    const doc = docOf([]);
    // 起点 0，向右拖 61 → 61，距画布中线（500）远；改成拖到 1003 附近验证叠加
    const r = snapMove(doc, ["a"], [f(0, 0, 100, 100)], 903, 0, 6);
    // 903 + 100 = 1003，右边缘距 1000 为 3 → dx = 903 - 3
    expect(r.dx).toBe(900);
  });

  it("不修改传入的 frame 数组", () => {
    const doc = docOf([]);
    const frames = [f(3, 100, 200, 150)];
    snapMove(doc, ["a"], frames, 0, 0, 6);
    expect(frames[0]).toEqual({ x: 3, y: 100, w: 200, h: 150 });
  });
});
