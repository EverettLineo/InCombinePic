import { describe, expect, it } from "vitest";
import {
  alignFrame,
  applyResize,
  coverCrop,
  cursorForHandle,
  frameCenter,
  handlePoints,
} from "./transform";
import type { CropRect, Frame } from "./types";

const fullCrop = (w: number, h: number): CropRect => ({ x: 0, y: 0, w, h });

describe("coverCrop / 无旋转", () => {
  it("源图比目标框宽：裁左右，结果比例等于目标框", () => {
    // 200x100 源图进 100x100 框：需要把宽度裁到 100
    const r = coverCrop(fullCrop(200, 100), 0, { w: 100, h: 100 });
    expect(r.crop.w).toBeCloseTo(100, 5);
    expect(r.crop.h).toBeCloseTo(100, 5);
    expect(r.crop.x).toBeCloseTo(50, 5); // 居中裁
    expect(r.crop.y).toBeCloseTo(0, 5);
    expect(r.drawW).toBeCloseTo(100, 5);
    expect(r.drawH).toBeCloseTo(100, 5);
  });

  it("源图比目标框高：裁上下，居中", () => {
    const r = coverCrop(fullCrop(100, 200), 0, { w: 100, h: 100 });
    expect(r.crop.h).toBeCloseTo(100, 5);
    expect(r.crop.y).toBeCloseTo(50, 5);
  });

  it("比例完全一致时不裁切", () => {
    const r = coverCrop(fullCrop(400, 200), 0, { w: 200, h: 100 });
    expect(r.crop).toEqual(fullCrop(400, 200));
    expect(r.scale).toBeCloseTo(0.5, 5);
  });

  it("不修改传入的 crop 对象（适配裁切不回写用户裁剪）", () => {
    const crop = fullCrop(200, 100);
    const snapshot = { ...crop };
    coverCrop(crop, 0, { w: 100, h: 100 });
    expect(crop).toEqual(snapshot);
  });
});

describe("coverCrop / 旋转 90", () => {
  it("旋转后宽高互换，据此裁切源图的上下", () => {
    // 200x100 源图旋转 90 后视觉是 100x200；进 100x100 框需要裁掉视觉上的上下，
    // 对应源图的左右
    const r = coverCrop(fullCrop(200, 100), 90, { w: 100, h: 100 });
    // 旋转后 eff 宽高 = 100 x 200，偏高 → 裁源图宽度
    expect(r.crop.w).toBeCloseTo(100, 5);
    expect(r.crop.x).toBeCloseTo(50, 5);
    expect(r.crop.h).toBeCloseTo(100, 5);
  });

  it("裁剪结果保持源图范围内", () => {
    const r = coverCrop({ x: 10, y: 10, w: 180, h: 80 }, 270, { w: 120, h: 120 });
    expect(r.crop.x).toBeGreaterThanOrEqual(10);
    expect(r.crop.y).toBeGreaterThanOrEqual(10);
    expect(r.crop.x + r.crop.w).toBeLessThanOrEqual(190.0001);
    expect(r.crop.y + r.crop.h).toBeLessThanOrEqual(90.0001);
  });
});

describe("coverCrop / 边界", () => {
  it("零尺寸返回 scale=0 而不抛异常", () => {
    expect(coverCrop(fullCrop(0, 0), 0, { w: 10, h: 10 }).scale).toBe(0);
    expect(coverCrop(fullCrop(10, 10), 0, { w: 0, h: 10 }).scale).toBe(0);
  });

  it("裁切产生的最小边不为 0", () => {
    const r = coverCrop(fullCrop(1000, 1), 0, { w: 10, h: 10 });
    expect(r.crop.w).toBeGreaterThan(0);
    expect(r.crop.h).toBeGreaterThan(0);
  });
});

describe("frameCenter", () => {
  it("返回 frame 中心点", () => {
    expect(frameCenter({ x: 10, y: 20, w: 100, h: 50 })).toEqual({ cx: 60, cy: 45 });
  });
});

describe("alignFrame", () => {
  it("对齐到整数像素，避免半像素接缝", () => {
    expect(alignFrame({ x: 1.4, y: 2.6, w: 10.5, h: 20.2 })).toEqual({
      x: 1,
      y: 3,
      w: 11,
      h: 20,
    });
  });
});

describe("handlePoints", () => {
  const frame: Frame = { x: 100, y: 50, w: 200, h: 100 };

  it("返回八个控制点且方位齐全", () => {
    const pts = handlePoints(frame);
    expect(pts).toHaveLength(8);
    expect(pts.map((p) => p.kind).sort()).toEqual(
      ["e", "n", "ne", "nw", "s", "se", "sw", "w"].sort(),
    );
  });

  it("角点落在矩形四角，边点落在边中点", () => {
    const pts = handlePoints(frame);
    const byKind = Object.fromEntries(pts.map((p) => [p.kind, p]));
    expect(byKind.nw).toMatchObject({ x: 100, y: 50 });
    expect(byKind.se).toMatchObject({ x: 300, y: 150 });
    expect(byKind.n).toMatchObject({ x: 200, y: 50 });
    expect(byKind.e).toMatchObject({ x: 300, y: 100 });
  });
});

describe("applyResize", () => {
  const frame: Frame = { x: 100, y: 100, w: 200, h: 100 };

  it("拖右边只改宽度，左边固定", () => {
    const r = applyResize(frame, "e", 50, 40);
    expect(r).toEqual({ x: 100, y: 100, w: 250, h: 100 });
  });

  it("拖左边改 x 且右边固定", () => {
    const r = applyResize(frame, "w", -50, 0);
    expect(r.x).toBe(50);
    expect(r.w).toBe(250);
    expect(r.x + r.w).toBe(300); // 右边不动
  });

  it("拖上边改 y 且下边固定", () => {
    const r = applyResize(frame, "n", 0, -30);
    expect(r.y).toBe(70);
    expect(r.h).toBe(130);
    expect(r.y + r.h).toBe(200);
  });

  it("拖右下角同时改宽高，左上角固定", () => {
    const r = applyResize(frame, "se", 20, 20);
    expect(r).toEqual({ x: 100, y: 100, w: 220, h: 120 });
  });

  it("拖左上角同时改 x/y 且右下角固定", () => {
    const r = applyResize(frame, "nw", -20, -10);
    expect(r.x).toBe(80);
    expect(r.y).toBe(90);
    expect(r.x + r.w).toBe(300);
    expect(r.y + r.h).toBe(200);
  });

  it("最小尺寸限制生效，不会被拖成零或负数", () => {
    const r = applyResize(frame, "e", -500, 0, 8);
    expect(r.w).toBe(8);
    const rw = applyResize(frame, "w", 500, 0, 8);
    expect(rw.w).toBe(8);
  });

  it("边中点只影响单一维度", () => {
    const r = applyResize(frame, "n", 40, -20);
    expect(r.x).toBe(100);
    expect(r.w).toBe(200);
    expect(r.h).toBe(120);
  });
});

describe("cursorForHandle", () => {
  it("角点与边点给出正确的缩放指针", () => {
    expect(cursorForHandle("nw")).toBe("nwse-resize");
    expect(cursorForHandle("se")).toBe("nwse-resize");
    expect(cursorForHandle("ne")).toBe("nesw-resize");
    expect(cursorForHandle("n")).toBe("ns-resize");
    expect(cursorForHandle("e")).toBe("ew-resize");
  });
});
