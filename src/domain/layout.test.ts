import { describe, expect, it } from "vitest";
import { cascadeFrame, centerFitFrame, gridFrames } from "./layout";

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

describe("cascadeFrame（双击/拖放的避让放置）", () => {
  it("空画布时等同于居中适配（按画布 60% 放，不额外缩小）", () => {
    const f = cascadeFrame({ width: 2000, height: 1000 }, { width: 2400, height: 1600 }, []);
    // centerFitFrame 的默认 maxRatio 是 0.6：宽度取 2400 × 0.6 = 1440
    expect(f.w).toBe(1440);
    expect(f.h).toBe(720);
    expect(f.x).toBe(480);
    expect(f.y).toBe(440);
  });

  it("已有居中实例时，新图错开且重叠显著减少", () => {
    const canvas = { width: 2400, height: 1600 };
    const size = { width: 2000, height: 1000 };
    const first = cascadeFrame(size, canvas, []);
    const second = cascadeFrame(size, canvas, [first]);

    expect(second).not.toEqual(first);
    // 必须仍完整落在画布内
    expect(second.x).toBeGreaterThanOrEqual(0);
    expect(second.y).toBeGreaterThanOrEqual(0);
    expect(second.x + second.w).toBeLessThanOrEqual(canvas.width);
    expect(second.y + second.h).toBeLessThanOrEqual(canvas.height);
  });

  it("重叠不可避免时，返回重叠最小的位置（优于居中完全被盖住）", () => {
    const canvas = { width: 1000, height: 1000 };
    const big = { x: 0, y: 0, w: 900, h: 900 };
    const f = cascadeFrame({ width: 200, height: 200 }, canvas, [big]);

    // 居中会 100% 落在大图内；错开后重叠必须明显下降
    const ow = Math.min(f.x + f.w, big.x + big.w) - Math.max(f.x, big.x);
    const oh = Math.min(f.y + f.h, big.y + big.h) - Math.max(f.y, big.y);
    const ratio = (Math.max(0, ow) * Math.max(0, oh)) / (f.w * f.h);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.9);
  });

  it("无可用空位时不抛异常，返回重叠最小的位置", () => {
    const canvas = { width: 100, height: 100 };
    const existing = [{ x: 0, y: 0, w: 100, h: 100 }];
    const f = cascadeFrame({ width: 100, height: 100 }, canvas, existing, { maxTries: 2 });
    expect(f.w).toBeGreaterThan(0);
    expect(f.x).toBeGreaterThanOrEqual(0);
  });
});
