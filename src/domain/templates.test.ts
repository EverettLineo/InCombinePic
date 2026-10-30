import { describe, expect, it } from "vitest";
import { addInstance, createInstance } from "./document";
import {
  applyTemplate,
  emptyCellIndices,
  findTemplate,
  placeIntoCell,
  replaceInstanceSource,
  templateFrames,
  TEMPLATES,
  type FillSource,
  type TemplateDef,
} from "./templates";
import { createEmptyDocument, type CanvasInstance, type DocumentState } from "./types";

function inst(id: string, itemId: string, seq: number, x = 0, y = 0): CanvasInstance {
  return {
    id,
    libraryItemId: itemId,
    createdSeq: seq,
    frame: { x, y, w: 100, h: 100 },
    crop: { x: 5, y: 6, w: 200, h: 150 },
    rotation: 90,
    flipH: true,
    flipV: false,
    opacity: 0.8,
    border: { width: 3, color: "#123456" },
    cornerRadius: 8,
  };
}

function docOf(list: CanvasInstance[], canvas = { width: 3000, height: 2000 }): DocumentState {
  const base = createEmptyDocument();
  return { ...base, canvas: { ...base.canvas, ...canvas }, instances: list };
}

const src = (itemId: string, w = 400, h = 300): FillSource => ({ itemId, width: w, height: h });

describe("模板清单（T8.1）", () => {
  it("共 20 个，分类配额与 D-07 一致", () => {
    expect(TEMPLATES).toHaveLength(20);
    const count = (c: TemplateDef["category"]) => TEMPLATES.filter((t) => t.category === c).length;
    expect(count("grid")).toBe(6);
    expect(count("long")).toBe(3);
    expect(count("columns")).toBe(4);
    expect(count("asymmetric")).toBe(4);
    expect(count("wall")).toBe(3);
  });

  it("id 与名称唯一", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(20);
    expect(new Set(TEMPLATES.map((t) => t.name)).size).toBe(20);
  });

  it("每个模板都铺满画布且单元格互不重叠", () => {
    for (const t of TEMPLATES) {
      const area = t.cells.reduce((sum, c) => sum + c.w * c.h, 0);
      expect(area, `${t.name} 面积和`).toBeCloseTo(1, 6);

      for (const c of t.cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
      }

      // 两两取交，重叠面积必须为 0（边界相接允许）
      for (let i = 0; i < t.cells.length; i++) {
        for (let j = i + 1; j < t.cells.length; j++) {
          const a = t.cells[i];
          const b = t.cells[j];
          const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          const overlap = Math.max(0, ow) * Math.max(0, oh);
          expect(overlap, `${t.name} 单元格 ${i}/${j} 重叠`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it("findTemplate 按 id 查询，未知 id 返回 undefined", () => {
    expect(findTemplate("grid-2x2")?.name).toBe("四分格");
    expect(findTemplate("nope")).toBeUndefined();
    expect(findTemplate(null)).toBeUndefined();
  });
});

describe("templateFrames（T8.2）", () => {
  const t = findTemplate("grid-2x2")!;

  it("间距为 0 时相邻单元格共用边界，不留 1px 缝", () => {
    const f = templateFrames(t, { width: 1200, height: 800 }, 0);
    expect(f[0].x + f[0].w).toBe(f[1].x);
    expect(f[0].y + f[0].h).toBe(f[2].y);
    expect(f[0]).toEqual({ x: 0, y: 0, w: 600, h: 400 });
    expect(f[3].x + f[3].w).toBe(1200);
    expect(f[3].y + f[3].h).toBe(800);
  });

  it("间距 20 时相邻间隔正好 20，外边缘各缩 10", () => {
    const f = templateFrames(t, { width: 1200, height: 800 }, 20);
    const gapX = f[1].x - (f[0].x + f[0].w);
    const gapY = f[2].y - (f[0].y + f[0].h);
    expect(gapX).toBe(20);
    expect(gapY).toBe(20);
    expect(f[0].x).toBe(10);
    expect(f[3].x + f[3].w).toBe(1190);
  });

  it("画布尺寸变化时按比例重算（归一化坐标的意义）", () => {
    const small = templateFrames(t, { width: 600, height: 400 }, 0);
    expect(small[0]).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });
});

describe("emptyCellIndices（T8.4）", () => {
  it("未占用的格子全部返回", () => {
    const t = findTemplate("grid-2x2")!;
    const frames = templateFrames(t, { width: 1200, height: 800 }, 0);
    const doc = docOf([{ ...inst("a", "item-a", 0), frame: frames[0] }], { width: 1200, height: 800 });
    expect(emptyCellIndices(doc, t)).toEqual([1, 2, 3]);
  });

  it("全部占满时返回空数组", () => {
    const t = findTemplate("grid-2x2")!;
    const frames = templateFrames(t, { width: 1200, height: 800 }, 0);
    const doc = docOf(
      frames.map((f, i) => ({ ...inst(`a${i}`, `item-${i}`, i), frame: f })),
      { width: 1200, height: 800 },
    );
    expect(emptyCellIndices(doc, t)).toEqual([]);
  });
});

describe("applyTemplate（T8.3 / T8.8）", () => {
  const t = findTemplate("grid-2x2")!;
  const canvas = { width: 1200, height: 800 };
  let n = 0;
  const newId = () => `new-${n++}`;

  it("按资源库顺序填格，资源不足时剩余留空", () => {
    const doc = docOf([], canvas);
    const out = applyTemplate(doc, t, [src("item-a"), src("item-b"), src("item-c")], newId);

    expect(out.instances).toHaveLength(3);
    expect(out.templateId).toBe("grid-2x2");
    expect(out.instances.map((i) => i.libraryItemId)).toEqual(["item-a", "item-b", "item-c"]);

    const frames = templateFrames(t, canvas, 0);
    expect(out.instances[0].frame).toEqual(frames[0]);
    expect(out.instances[2].frame).toEqual(frames[2]);
    expect(emptyCellIndices(out, t)).toEqual([3]);
  });

  it("复用已有实例并保留裁剪/旋转/翻转/透明度/边框/圆角", () => {
    const doc = docOf([inst("old", "item-b", 3)], canvas);
    const out = applyTemplate(doc, t, [src("item-a"), src("item-b")], newId);

    const reused = out.instances.find((i) => i.libraryItemId === "item-b")!;
    expect(reused.id).toBe("old");
    expect(reused.crop).toEqual({ x: 5, y: 6, w: 200, h: 150 });
    expect(reused.rotation).toBe(90);
    expect(reused.flipH).toBe(true);
    expect(reused.opacity).toBe(0.8);
    expect(reused.border).toEqual({ width: 3, color: "#123456" });
    expect(reused.cornerRadius).toBe(8);
    // 位置按新布局重设
    expect(reused.frame).toEqual(templateFrames(t, canvas, 0)[1]);
  });

  it("同一资源有多个实例时复用最早创建的，其余移出画布", () => {
    const doc = docOf(
      [inst("late", "item-a", 9), inst("early", "item-a", 2), inst("mid", "item-a", 5)],
      canvas,
    );
    const out = applyTemplate(doc, t, [src("item-a")], newId);

    expect(out.instances).toHaveLength(1);
    expect(out.instances[0].id).toBe("early");
  });

  it("未进入新布局的实例被移出画布（资源库不动）", () => {
    const doc = docOf([inst("x", "item-x", 0), inst("y", "item-y", 1)], canvas);
    const out = applyTemplate(doc, t, [src("item-a")], newId);

    expect(out.instances.map((i) => i.libraryItemId)).toEqual(["item-a"]);
  });

  it("已在新模板中表示的资源不会被重复创建", () => {
    const doc = docOf([inst("a", "item-a", 0)], canvas);
    const out = applyTemplate(doc, t, [src("item-a")], newId);
    expect(out.instances).toHaveLength(1);
    expect(out.instances[0].id).toBe("a");
  });

  it("同路径的不同条目各自复用自己的实例（规则 4）", () => {
    const doc = docOf([inst("first", "entry-1", 0), inst("second", "entry-2", 1)], canvas);

    const out = applyTemplate(doc, t, [src("entry-1"), src("entry-2")], newId);
    expect(out.instances.map((i) => i.id)).toEqual(["first", "second"]);
  });

  it("新实例的 createdSeq 递增且不重复（模板填充的隐形坑）", () => {
    const doc = docOf([inst("a", "item-a", 0)], canvas);
    const out = applyTemplate(doc, t, [src("item-b"), src("item-c"), src("item-d")], newId);
    const seqs = out.instances.map((i) => i.createdSeq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(Math.min(...seqs)).toBe(1);
  });

  it("资源多于单元格时，多余资源不进画布", () => {
    const doc = docOf([], canvas);
    const order = Array.from({ length: 10 }, (_, i) => src(`item-${i}`));
    const out = applyTemplate(doc, t, order, newId);
    expect(out.instances).toHaveLength(4);
  });
});

describe("placeIntoCell / replaceInstanceSource（T8.5 / T8.6）", () => {
  const t = findTemplate("grid-2x2")!;
  const canvas = { width: 1200, height: 800 };

  it("把资源放进指定空白单元格", () => {
    const doc = docOf([], canvas);
    const out = placeIntoCell(doc, t, 2, src("item-a", 640, 480), "new-1");
    expect(out.instances).toHaveLength(1);
    expect(out.instances[0].frame).toEqual(templateFrames(t, canvas, 0)[2]);
    expect(out.instances[0].crop).toEqual({ x: 0, y: 0, w: 640, h: 480 });
  });

  it("单元格下标越界时原样返回", () => {
    const doc = docOf([], canvas);
    expect(placeIntoCell(doc, t, 99, src("item-a"), "new-1")).toBe(doc);
  });

  it("替换来源：保留位置与外观，裁剪按新图重置", () => {
    const doc = docOf([inst("a", "item-old", 0)], canvas);
    const out = replaceInstanceSource(doc, "a", src("item-new", 800, 600));
    expect(out.instances[0].libraryItemId).toBe("item-new");
    expect(out.instances[0].crop).toEqual({ x: 0, y: 0, w: 800, h: 600 });
    expect(out.instances[0].rotation).toBe(90);
    expect(out.instances[0].border.width).toBe(3);
  });
});

describe("模板与撤销的原子性（T8.9）", () => {
  it("一次 applyTemplate 只产生一个新文档对象", () => {
    const t = findTemplate("grid-2x2")!;
    const doc = docOf([], { width: 1200, height: 800 });
    const out = applyTemplate(doc, t, [src("a"), src("b")], (i) => `n${i}`);
    expect(out).not.toBe(doc);
    // 未改动的字段保持引用（快照模型下内存友好）
    expect(out.canvas).toBe(doc.canvas);
  });
});

describe("新建实例的裁剪初始化", () => {
  it("createInstance 接受显式 seq", () => {
    const doc = createEmptyDocument();
    const a = createInstance(doc, {
      id: "a",
      libraryItemId: "lib",
      sourceWidth: 100,
      sourceHeight: 80,
      frame: { x: 0, y: 0, w: 10, h: 10 },
      seq: 7,
    });
    expect(a.createdSeq).toBe(7);
    const withA = addInstance(doc, a);
    const b = createInstance(withA, {
      id: "b",
      libraryItemId: "lib",
      sourceWidth: 100,
      sourceHeight: 80,
      frame: { x: 0, y: 0, w: 10, h: 10 },
    });
    expect(b.createdSeq).toBe(8);
  });
});

describe("20 个模板逐个验收（T8.10 的自动化部分）", () => {
  const canvas = { width: 2400, height: 1600 };

  it.each(TEMPLATES.map((t) => [t.name, t] as const))(
    "%s：填满后不越界、不重叠，且格数一致",
    (_name, t) => {
      const doc = docOf([], canvas);
      const order = Array.from({ length: t.cells.length }, (_, i) => src(`item-${i}`, 800, 600));
      const out = applyTemplate(doc, t, order, (i) => `n${i}`);

      expect(out.instances).toHaveLength(t.cells.length);
      expect(emptyCellIndices(out, t)).toEqual([]);

      for (const inst of out.instances) {
        const f = inst.frame;
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.x + f.w).toBeLessThanOrEqual(canvas.width);
        expect(f.y + f.h).toBeLessThanOrEqual(canvas.height);
        expect(f.w).toBeGreaterThan(0);
        expect(f.h).toBeGreaterThan(0);
      }

      for (let i = 0; i < out.instances.length; i++) {
        for (let j = i + 1; j < out.instances.length; j++) {
          const a = out.instances[i].frame;
          const b = out.instances[j].frame;
          const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(Math.max(0, ow) * Math.max(0, oh), `${t.name} 第 ${i}/${j} 格重叠`).toBeLessThan(1e-6);
        }
      }
    },
  );

  it("带间距时仍然不越界且相邻间隔一致", () => {
    const t = findTemplate("grid-2x2")!;
    const doc = { ...docOf([], canvas), gap: 16 };
    const out = applyTemplate(doc, t, [src("a"), src("b")], (i) => `n${i}`);
    const [f0, f1] = out.instances.map((i) => i.frame);
    expect(f1.x - (f0.x + f0.w)).toBe(16);
  });
});
