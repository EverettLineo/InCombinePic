import { describe, expect, it } from "vitest";
import { centerFitFrame, gridFrames } from "./layout";

const canvas = { width: 2400, height: 1600 };

describe("centerFitFrame", () => {
  it("等比缩放到画布 60% 并居中", () => {
    const f = centerFitFrame({ width: 1000, height: 500 }, canvas);
    // 2400*0.6=1440, 1600*0.6=960；1000x500 受宽度限制 → 1440x720
    expect(f.w).toBe(1440);
    expect(f.h).toBe(720);
    expect(f.x).toBe((2400 - 1440) / 2);
    expect(f.y).toBe((1600 - 720) / 2);
  });

  it("保持原始宽高比", () => {
    const f = centerFitFrame({ width: 300, height: 600 }, canvas);
    expect(f.w / f.h).toBeCloseTo(0.5, 1);
  });

  it("非法输入返回零矩形而不抛异常", () => {
    expect(centerFitFrame({ width: 0, height: 10 }, canvas)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("gridFrames", () => {
  it("数量为 0 时返回空数组", () => {
    expect(gridFrames([], canvas, 20)).toEqual([]);
  });

  it("结果数量与输入一致", () => {
    const items = Array.from({ length: 5 }, () => ({ width: 400, height: 300 }));
    expect(gridFrames(items, canvas, 20)).toHaveLength(5);
  });

  it("同样输入得到同样结果（可预测，不含随机）", () => {
    const items = Array.from({ length: 4 }, () => ({ width: 400, height: 300 }));
    expect(gridFrames(items, canvas, 16)).toEqual(gridFrames(items, canvas, 16));
  });

  it("各帧互不重叠", () => {
    const items = Array.from({ length: 6 }, () => ({ width: 400, height: 300 }));
    const frames = gridFrames(items, canvas, 24);
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        const a = frames[i];
        const b = frames[j];
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `帧 ${i} 与 ${j} 重叠`).toBe(false);
      }
    }
  });

  it("所有帧都落在画布范围内", () => {
    const items = Array.from({ length: 7 }, () => ({ width: 800, height: 600 }));
    for (const f of gridFrames(items, canvas, 20)) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(canvas.width);
      expect(f.y + f.h).toBeLessThanOrEqual(canvas.height);
    }
  });

  it("保持各自宽高比", () => {
    const items = [
      { width: 800, height: 400 },
      { width: 400, height: 800 },
    ];
    const frames = gridFrames(items, canvas, 20);
    expect(frames[0].w / frames[0].h).toBeCloseTo(2, 1);
    expect(frames[1].w / frames[1].h).toBeCloseTo(0.5, 1);
  });
});
