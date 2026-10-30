import { describe, expect, it } from "vitest";
import {
  cropAspectFor,
  initialCropNorm,
  moveCrop,
  resizeCrop,
  toNorm,
  toSource,
  type CropHandle,
  type NormRect,
} from "./crop";

const ASPECT = 1.6; // 例如 1600×1000 的格子
const start: NormRect = { x: 0.2, y: 0.2, w: 0.6, h: 0.375 };

const HANDLES: CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function ratio(r: NormRect): number {
  return r.w / r.h;
}

describe("cropAspectFor", () => {
  it("旋转 0/180 时取 frame 的宽高比", () => {
    expect(cropAspectFor({ w: 1600, h: 1000 }, 0)).toBeCloseTo(1.6, 6);
    expect(cropAspectFor({ w: 1600, h: 1000 }, 180)).toBeCloseTo(1.6, 6);
  });

  it("旋转 90/270 时取倒数（宽高互换）", () => {
    expect(cropAspectFor({ w: 1600, h: 1000 }, 90)).toBeCloseTo(0.625, 6);
    expect(cropAspectFor({ w: 1600, h: 1000 }, 270)).toBeCloseTo(0.625, 6);
  });
});

describe("toNorm / toSource", () => {
  it("往返一致（像素取整误差不超过 1）", () => {
    const src = { w: 4000, h: 3000 };
    const rect = { x: 800, y: 600, w: 1200, h: 900 };
    const back = toSource(toNorm(rect, src), src);
    expect(Math.abs(back.x - rect.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.y - rect.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.w - rect.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.h - rect.h)).toBeLessThanOrEqual(1);
  });

  it("越界输入被夹回源图内，且不产生零面积", () => {
    const r = toSource({ x: 0.9, y: 0.95, w: 0.5, h: 0.5 }, { w: 1000, h: 800 });
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(1000);
    expect(r.y + r.h).toBeLessThanOrEqual(800);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });
});

describe("moveCrop", () => {
  it("平移夹在源图内，尺寸不变", () => {
    const r = moveCrop(start, 0.5, 0.5);
    expect(r.w).toBe(start.w);
    expect(r.h).toBe(start.h);
    // x 上界 1-0.6=0.4；y 上界 1-0.375=0.625
    expect(r.x).toBeCloseTo(0.4, 6);
    expect(r.y).toBeCloseTo(0.625, 6);
  });

  it("超出边界时贴边而不是缩小", () => {
    const r = moveCrop(start, -10, -10);
    expect(r).toMatchObject({ x: 0, y: 0, w: start.w, h: start.h });
  });
});

describe("resizeCrop", () => {
  it("八个方向都严格保持宽高比", () => {
    for (const kind of HANDLES) {
      const r = resizeCrop(start, kind, 0.5, 0.5, ASPECT);
      expect(ratio(r)).toBeCloseTo(ASPECT, 6);
    }
  });

  it("角点拖动时对角固定", () => {
    const r = resizeCrop(start, "nw", 0.35, 0.3, ASPECT);
    expect(r.x + r.w).toBeCloseTo(start.x + start.w, 6);
    expect(r.y + r.h).toBeCloseTo(start.y + start.h, 6);
  });

  it("右边界拖动时垂直中线固定", () => {
    const cy = start.y + start.h / 2;
    const r = resizeCrop(start, "e", 0.7, 0, ASPECT);
    expect(r.y + r.h / 2).toBeCloseTo(cy, 6);
    expect(r.x).toBeCloseTo(start.x, 6);
  });

  it("上边界拖动时水平中线固定", () => {
    const cx = start.x + start.w / 2;
    const r = resizeCrop(start, "n", 0, 0.1, ASPECT);
    expect(r.x + r.w / 2).toBeCloseTo(cx, 6);
    expect(r.y + r.h).toBeCloseTo(start.y + start.h, 6);
  });

  it("任何方向拖动都不会越出源图", () => {
    for (const kind of HANDLES) {
      for (const [px, py] of [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
        [0.999, 0.001],
      ]) {
        const r = resizeCrop(start, kind, px, py, ASPECT);
        expect(r.x).toBeGreaterThanOrEqual(-1e-9);
        expect(r.y).toBeGreaterThanOrEqual(-1e-9);
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
      }
    }
  });

  it("最小尺寸生效：把控制点拖到对角上也不会归零", () => {
    const r = resizeCrop(start, "se", start.x, start.y, ASPECT, 0.02);
    expect(r.w).toBeGreaterThanOrEqual(0.02 - 1e-9);
    expect(ratio(r)).toBeCloseTo(ASPECT, 6);
  });

  it("指针拖到源图外时按边界处理，不产生负尺寸", () => {
    const r = resizeCrop(start, "e", 5, 5, ASPECT);
    expect(r.w).toBeGreaterThan(0);
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("initialCropNorm", () => {
  it("以当前可见区域为起点，不越界", () => {
    const r = initialCropNorm({ x: 400, y: 300, w: 800, h: 500 }, { w: 4000, h: 3000 });
    expect(r.x).toBeCloseTo(0.1, 6);
    expect(r.y).toBeCloseTo(0.1, 6);
    expect(r.w).toBeCloseTo(0.2, 6);
    expect(r.h).toBeCloseTo(1 / 6, 6);
  });
});
