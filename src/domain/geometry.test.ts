import { describe, expect, it } from "vitest";
import { containsPoint, fitInto, intersects, rotateSize, snapToPixel } from "./geometry";

describe("rotateSize", () => {
  it("90/270 度交换宽高", () => {
    expect(rotateSize(400, 300, 90)).toEqual({ w: 300, h: 400 });
    expect(rotateSize(400, 300, 270)).toEqual({ w: 300, h: 400 });
  });

  it("0/180 度保持宽高", () => {
    expect(rotateSize(400, 300, 0)).toEqual({ w: 400, h: 300 });
    expect(rotateSize(400, 300, 180)).toEqual({ w: 400, h: 300 });
  });
});

describe("fitInto / fill", () => {
  it("横图填满方形框时按高度受限并裁切宽度", () => {
    // 400x300 进 200x200：fill 取 max(0.5, 0.667) = 0.667 → 266.7 x 200
    const r = fitInto(400, 300, { w: 200, h: 200 }, "fill");
    expect(r.scale).toBeCloseTo(2 / 3, 5);
    expect(r.w).toBeCloseTo(266.67, 1);
    expect(r.h).toBeCloseTo(200, 1);
    // 超出部分左右各裁 33.3，故 dx 为负值
    expect(r.dx).toBeLessThan(0);
    expect(r.dy).toBeCloseTo(0, 5);
  });

  it("fill 结果必然覆盖目标框", () => {
    const r = fitInto(1000, 200, { w: 300, h: 300 }, "fill");
    expect(r.w).toBeGreaterThanOrEqual(300);
    expect(r.h).toBeGreaterThanOrEqual(300);
  });
});

describe("fitInto / contain", () => {
  it("完整显示时留有空白且居中", () => {
    const r = fitInto(400, 200, { w: 200, h: 200 }, "contain");
    expect(r.scale).toBeCloseTo(0.5, 5);
    expect(r.w).toBeCloseTo(200, 5);
    expect(r.h).toBeCloseTo(100, 5);
    expect(r.dy).toBeCloseTo(50, 5);
  });

  it("contain 结果必然不超出目标框", () => {
    const r = fitInto(1000, 200, { w: 300, h: 300 }, "contain");
    expect(r.w).toBeLessThanOrEqual(300 + 1e-9);
    expect(r.h).toBeLessThanOrEqual(300 + 1e-9);
  });

  it("非法尺寸返回全零而不抛异常", () => {
    expect(fitInto(0, 100, { w: 10, h: 10 }, "fill").scale).toBe(0);
    expect(fitInto(100, 100, { w: 0, h: 10 }, "fill").scale).toBe(0);
  });
});

describe("containsPoint", () => {
  const rect = { x: 10, y: 20, w: 100, h: 50 };

  it("内部点命中", () => {
    expect(containsPoint(rect, 50, 40)).toBe(true);
  });

  it("边界点命中", () => {
    expect(containsPoint(rect, 10, 20)).toBe(true);
    expect(containsPoint(rect, 110, 70)).toBe(true);
  });

  it("外部点不命中", () => {
    expect(containsPoint(rect, 9.9, 40)).toBe(false);
    expect(containsPoint(rect, 50, 71)).toBe(false);
  });
});

describe("intersects", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };

  it("重叠时返回 true", () => {
    expect(intersects(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
  });

  it("仅相邻边界不算重叠（用于自动排布避免误判）", () => {
    expect(intersects(a, { x: 100, y: 0, w: 100, h: 100 })).toBe(false);
  });

  it("分离时返回 false", () => {
    expect(intersects(a, { x: 200, y: 200, w: 10, h: 10 })).toBe(false);
  });
});

describe("snapToPixel", () => {
  it("四舍五入到整数像素，保证条带渲染不产生半像素接缝", () => {
    expect(snapToPixel(10.4)).toBe(10);
    expect(snapToPixel(10.5)).toBe(11);
    expect(snapToPixel(-0.5)).toBe(-0);
  });
});
