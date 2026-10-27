import { describe, expect, it } from "vitest";
import {
  addInstance,
  createInstance,
  instanceCountByLibraryItem,
  nextCreatedSeq,
  removeInstances,
  removeInstancesByLibraryItem,
  reorderInstance,
  rotateInstance,
  setCanvasSize,
  setCrop,
  updateInstance,
} from "./document";
import { createEmptyDocument, type CanvasInstance } from "./types";

function inst(id: string, seq: number, libraryItemId = "lib-1"): CanvasInstance {
  return {
    id,
    libraryItemId,
    createdSeq: seq,
    frame: { x: 0, y: 0, w: 100, h: 100 },
    crop: { x: 0, y: 0, w: 400, h: 300 },
    rotation: 0,
    flipH: false,
    flipV: false,
    opacity: 1,
    border: { width: 0, color: "#000000" },
    cornerRadius: 0,
  };
}

describe("createInstance", () => {
  it("新实例默认无边框、无圆角、不透明", () => {
    const doc = createEmptyDocument();
    const i = createInstance(doc, {
      id: "a",
      libraryItemId: "lib-1",
      sourceWidth: 800,
      sourceHeight: 600,
      frame: { x: 10, y: 20, w: 200, h: 150 },
    });
    expect(i.border.width).toBe(0);
    expect(i.cornerRadius).toBe(0);
    expect(i.opacity).toBe(1);
    expect(i.rotation).toBe(0);
  });

  it("crop 初始化为整张源图（非破坏性裁剪的起点）", () => {
    const doc = createEmptyDocument();
    const i = createInstance(doc, {
      id: "a",
      libraryItemId: "lib-1",
      sourceWidth: 800,
      sourceHeight: 600,
      frame: { x: 0, y: 0, w: 100, h: 100 },
    });
    expect(i.crop).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it("createdSeq 单调递增，供模板复用最早实例使用", () => {
    let doc = createEmptyDocument();
    const base = { libraryItemId: "lib-1", sourceWidth: 10, sourceHeight: 10, frame: { x: 0, y: 0, w: 1, h: 1 } };
    doc = addInstance(doc, createInstance(doc, { ...base, id: "a" }));
    doc = addInstance(doc, createInstance(doc, { ...base, id: "b" }));
    doc = addInstance(doc, createInstance(doc, { ...base, id: "c" }));
    expect(doc.instances.map((i) => i.createdSeq)).toEqual([0, 1, 2]);
    expect(nextCreatedSeq(doc)).toBe(3);
  });
});

describe("不可变性", () => {
  it("addInstance 不修改原文档", () => {
    const doc = createEmptyDocument();
    const next = addInstance(doc, inst("a", 0));
    expect(doc.instances).toHaveLength(0);
    expect(next.instances).toHaveLength(1);
    expect(next).not.toBe(doc);
  });

  it("removeInstances 无匹配时返回同一引用，便于上层廉价比较", () => {
    const doc = addInstance(createEmptyDocument(), inst("a", 0));
    expect(removeInstances(doc, ["not-exist"])).toBe(doc);
  });

  it("updateInstance 未命中时返回同一引用", () => {
    const doc = addInstance(createEmptyDocument(), inst("a", 0));
    expect(updateInstance(doc, "nope", { opacity: 0 })).toBe(doc);
  });
});

describe("removeInstancesByLibraryItem", () => {
  it("释放资源时级联移除其全部实例，且不误伤其他资源的实例", () => {
    let doc = createEmptyDocument();
    doc = addInstance(doc, inst("a1", 0, "lib-1"));
    doc = addInstance(doc, inst("a2", 1, "lib-1"));
    doc = addInstance(doc, inst("b1", 2, "lib-2"));

    const next = removeInstancesByLibraryItem(doc, ["lib-1"]);
    expect(next.instances.map((i) => i.id)).toEqual(["b1"]);
    expect(instanceCountByLibraryItem(next, "lib-1")).toBe(0);
  });

  it("同一资源的多个实例都被移除（同一资源可多次放置）", () => {
    let doc = createEmptyDocument();
    doc = addInstance(doc, inst("a1", 0, "lib-1"));
    doc = addInstance(doc, inst("a2", 1, "lib-1"));
    expect(instanceCountByLibraryItem(doc, "lib-1")).toBe(2);
    expect(removeInstancesByLibraryItem(doc, ["lib-1"]).instances).toHaveLength(0);
  });
});

describe("reorderInstance", () => {
  it("数组内移动调整图层顺序", () => {
    let doc = createEmptyDocument();
    doc = addInstance(doc, inst("a", 0));
    doc = addInstance(doc, inst("b", 1));
    doc = addInstance(doc, inst("c", 2));

    const moved = reorderInstance(doc, 0, 2);
    expect(moved.instances.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("越界或原地移动返回原引用", () => {
    const doc = addInstance(createEmptyDocument(), inst("a", 0));
    expect(reorderInstance(doc, 0, 0)).toBe(doc);
    expect(reorderInstance(doc, 0, 5)).toBe(doc);
  });
});

describe("setCanvasSize", () => {
  it("只改画布边界，不移动已有实例（基线 §5.3）", () => {
    let doc = addInstance(createEmptyDocument(), inst("a", 0));
    const before = doc.instances[0].frame;
    doc = setCanvasSize(doc, 1200, 900);
    expect(doc.canvas.width).toBe(1200);
    expect(doc.instances[0].frame).toEqual(before);
  });

  it("尺寸取整且不小于 1", () => {
    const doc = setCanvasSize(createEmptyDocument(), 0, -5);
    expect(doc.canvas.width).toBe(1);
    expect(doc.canvas.height).toBe(1);
  });
});

describe("rotateInstance", () => {
  it("90 度步进循环，且不改变 frame 与 crop", () => {
    let doc = addInstance(createEmptyDocument(), inst("a", 0));
    const frame = doc.instances[0].frame;
    const crop = doc.instances[0].crop;

    doc = rotateInstance(doc, "a", 90);
    expect(doc.instances[0].rotation).toBe(90);
    doc = rotateInstance(doc, "a", 90);
    doc = rotateInstance(doc, "a", 90);
    doc = rotateInstance(doc, "a", 90);
    expect(doc.instances[0].rotation).toBe(0);
    expect(doc.instances[0].frame).toEqual(frame);
    expect(doc.instances[0].crop).toEqual(crop);
  });

  it("逆时针旋转到 270", () => {
    let doc = addInstance(createEmptyDocument(), inst("a", 0));
    doc = rotateInstance(doc, "a", -90);
    expect(doc.instances[0].rotation).toBe(270);
  });
});

describe("setCrop", () => {
  it("裁剪被约束在源图范围内", () => {
    let doc = addInstance(createEmptyDocument(), inst("a", 0));
    doc = setCrop(doc, "a", { x: -50, y: -20, w: 999, h: 999 }, { w: 400, h: 300 });
    expect(doc.instances[0].crop).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  it("裁剪面积不会退化为 0", () => {
    let doc = addInstance(createEmptyDocument(), inst("a", 0));
    doc = setCrop(doc, "a", { x: 400, y: 300, w: 0, h: 0 }, { w: 400, h: 300 });
    expect(doc.instances[0].crop.w).toBeGreaterThan(0);
    expect(doc.instances[0].crop.h).toBeGreaterThan(0);
  });
});

describe("多实例场景", () => {
  it("删除实例不影响资源库条目语义（实例与资源解耦）", () => {
    let doc = createEmptyDocument();
    doc = addInstance(doc, inst("a1", 0, "lib-1"));
    doc = addInstance(doc, inst("a2", 1, "lib-1"));
    const next = removeInstances(doc, ["a1"]);
    // 删除实例后，另一实例仍引用同一资源
    expect(next.instances[0].libraryItemId).toBe("lib-1");
    expect(instanceCountByLibraryItem(next, "lib-1")).toBe(1);
  });
});
