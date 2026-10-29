import { describe, expect, it } from "vitest";
import {
  alignInstances,
  displayIndexToArray,
  distributeInstances,
  selectionBounds,
} from "./align";
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

function docOf(...list: CanvasInstance[]): DocumentState {
  return { ...createEmptyDocument(), instances: list };
}

function frames(doc: DocumentState): Record<string, { x: number; y: number; w: number; h: number }> {
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const it of doc.instances) out[it.id] = it.frame;
  return out;
}

describe("selectionBounds", () => {
  it("取选中集合的并集包围盒", () => {
    const doc = docOf(inst("a", 10, 20, 100, 50), inst("b", 250, 5, 40, 200));
    expect(selectionBounds(doc, ["a", "b"])).toEqual({ x: 10, y: 5, w: 280, h: 200 });
  });

  it("忽略不在选中集合中的对象", () => {
    const doc = docOf(inst("a", 10, 10, 10, 10), inst("b", 900, 900, 10, 10));
    expect(selectionBounds(doc, ["a"])).toEqual({ x: 10, y: 10, w: 10, h: 10 });
  });

  it("空选中返回 null", () => {
    expect(selectionBounds(docOf(), [])).toBeNull();
  });
});

describe("alignInstances", () => {
  const doc = docOf(inst("a", 10, 20, 100, 60), inst("b", 200, 100, 40, 40), inst("c", 60, 300, 80, 20));
  const ids = ["a", "b", "c"];

  it("左对齐：所有左边缘等于包围盒左边缘", () => {
    const f = frames(alignInstances(doc, ids, "left"));
    expect(f.a.x).toBe(10);
    expect(f.b.x).toBe(10);
    expect(f.c.x).toBe(10);
    // 纵向不动
    expect(f.b.y).toBe(100);
  });

  it("水平居中：所有中心 x 相等（取整）", () => {
    const f = frames(alignInstances(doc, ids, "hcenter"));
    const centers = [f.a, f.b, f.c].map((r) => r.x + r.w / 2);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(0.5);
  });

  it("右对齐：所有右边缘等于包围盒右边缘", () => {
    const f = frames(alignInstances(doc, ids, "right"));
    expect(f.a.x + f.a.w).toBe(240);
    expect(f.b.x + f.b.w).toBe(240);
    expect(f.c.x + f.c.w).toBe(240);
  });

  it("上/垂直居中/下对齐只改 y", () => {
    const top = frames(alignInstances(doc, ids, "top"));
    expect([top.a.y, top.b.y, top.c.y]).toEqual([20, 20, 20]);
    expect(top.a.x).toBe(10);

    const mid = frames(alignInstances(doc, ids, "vcenter"));
    const centers = [mid.a, mid.b, mid.c].map((r) => r.y + r.h / 2);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(0.5);

    const bottom = frames(alignInstances(doc, ids, "bottom"));
    expect([bottom.a.y + bottom.a.h, bottom.b.y + bottom.b.h, bottom.c.y + bottom.c.h]).toEqual([
      320, 320, 320,
    ]);
  });

  it("少于 2 个有效对象时返回原对象（不做无意义对齐）", () => {
    expect(alignInstances(doc, ["a"], "left")).toBe(doc);
    expect(alignInstances(doc, ["nope", "nada"], "left")).toBe(doc);
  });

  it("已经对齐时不产生新对象（避免多出一步撤销）", () => {
    const aligned = alignInstances(doc, ids, "left");
    expect(alignInstances(aligned, ids, "left")).toBe(aligned);
  });

  it("不修改传入的文档", () => {
    const before = JSON.stringify(doc);
    alignInstances(doc, ids, "right");
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe("distributeInstances", () => {
  it("水平等距：首尾不动，中间按边缘间隙均分", () => {
    // 总跨度 0..300，宽度和 60+60+60=180，两段间隙各 60
    const doc = docOf(inst("a", 0, 0, 60, 40), inst("b", 70, 0, 60, 40), inst("c", 240, 0, 60, 40));
    const f = frames(distributeInstances(doc, ["a", "b", "c"], "horizontal"));
    expect(f.a.x).toBe(0);
    expect(f.b.x).toBe(120);
    expect(f.c.x).toBe(240);
  });

  it("输入顺序不影响结果（按位置排序）", () => {
    const doc = docOf(inst("c", 240, 0, 60, 40), inst("a", 0, 0, 60, 40), inst("b", 70, 0, 60, 40));
    const f = frames(distributeInstances(doc, ["a", "b", "c"], "horizontal"));
    expect(f.b.x).toBe(120);
  });

  it("垂直等距同理", () => {
    // 跨度 0..300，高度和 150，两段间隙各 75
    const doc = docOf(inst("a", 0, 0, 40, 50), inst("b", 0, 55, 40, 50), inst("c", 0, 250, 40, 50));
    const f = frames(distributeInstances(doc, ["a", "b", "c"], "vertical"));
    expect(f.a.y).toBe(0);
    expect(f.b.y).toBe(125);
    expect(f.c.y).toBe(250);
  });

  it("本来重叠时产生相等的负间隙，而不是被夹成 0", () => {
    const doc = docOf(inst("a", 0, 0, 100, 40), inst("b", 10, 0, 100, 40), inst("c", 20, 0, 100, 40));
    const f = frames(distributeInstances(doc, ["a", "b", "c"], "horizontal"));
    const gapAB = f.b.x - (f.a.x + f.a.w);
    const gapBC = f.c.x - (f.b.x + f.b.w);
    expect(gapAB).toBe(gapBC);
    expect(gapAB).toBeLessThan(0);
  });

  it("少于 3 个有效对象时返回原对象", () => {
    const doc = docOf(inst("a", 0, 0, 10, 10), inst("b", 50, 0, 10, 10));
    expect(distributeInstances(doc, ["a", "b"], "horizontal")).toBe(doc);
  });

  it("宽度不同时也保持边缘间隙相等", () => {
    const doc = docOf(inst("a", 0, 0, 20, 10), inst("b", 30, 0, 100, 10), inst("c", 300, 0, 30, 10));
    const f = frames(distributeInstances(doc, ["a", "b", "c"], "horizontal"));
    const gap1 = f.b.x - (f.a.x + f.a.w);
    const gap2 = f.c.x - (f.b.x + f.b.w);
    expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(1);
  });
});

describe("displayIndexToArray", () => {
  it("图层列表顶层在上，数组底层在前，两者互为镜像", () => {
    expect(displayIndexToArray(0, 3)).toBe(2);
    expect(displayIndexToArray(2, 3)).toBe(0);
    expect(displayIndexToArray(0, 1)).toBe(0);
  });

  it("正反变换可逆（任意位置拖动都不丢失对象）", () => {
    for (let n = 1; n <= 6; n++) {
      for (let i = 0; i < n; i++) {
        expect(displayIndexToArray(displayIndexToArray(i, n), n)).toBe(i);
      }
    }
  });
});
