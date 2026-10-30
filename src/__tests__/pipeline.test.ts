/**
 * 端到端用例集（T12.1 / T12.2）。
 *
 * **这不是 UI 级 E2E。** 本应用是 Tauri 桌面程序，UI 自动化需要 WebDriver + 真实窗口，
 * 当前环境无法支撑（KI-13/14/16~21 记录了必须人工走查的部分）。
 *
 * 这里覆盖的是「一条完整用户路径所经过的全部领域模块」：
 * 导入结果 → 资源库排序 → 模板填充 → 编辑 → 撤销/重做 → 导出计划。
 * 它锁的是**模块之间的契约**：单个模块自己测过，不代表串起来还对。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  addInstance,
  createInstance,
  removeInstancesByLibraryItem,
  rotateInstance,
  setCrop,
  updateInstance,
} from "../domain/document";
import { moveInOrder, sortLibrary } from "../domain/library";
import {
  planStrips,
  validateExportSize,
  ensureExtension,
  defaultExportName,
  MAX_EXPORT_EDGE,
} from "../domain/export";
import {
  applyTemplate,
  emptyCellIndices,
  fillSourcesOf,
  findTemplate,
  placeIntoCell,
  templateFrames,
} from "../domain/templates";
import { createEmptyDocument, type LibraryItem } from "../domain/types";
import { useDocStore } from "../state/docStore";
import { useLibraryStore } from "../state/libraryStore";

function item(n: number, w = 4000, h = 3000): LibraryItem {
  return {
    id: `item-${n}`,
    sourcePath: `C:\\photos\\IMG_${n}.jpg`,
    fileName: `IMG_${n}.jpg`,
    importSeq: n,
    importedAt: 1_700_000_000_000 + n,
    width: w,
    height: h,
    format: "jpeg",
    hasAlpha: false,
    fileSize: 2_400_000,
  };
}

function resetAll() {
  useDocStore.setState({
    doc: createEmptyDocument(),
    revision: 0,
    dirty: false,
    past: [],
    future: [],
    mergeKey: null,
    lastCommitAt: 0,
  });
  useLibraryStore.setState({ items: [], customOrder: [], sortMode: "custom" });
}

beforeEach(resetAll);

describe("端到端：导入 → 编辑 → 撤销 → 模板 → 导出", () => {
  it("五步链路串起来后，几何与导出计划仍然自洽", () => {
    const doc = useDocStore.getState();
    const lib = useLibraryStore.getState();

    // ---- 1. 导入：4 张成功入库（第 5 个文件假定解码失败，不产生条目）----
    const items = [item(1), item(2), item(3), item(4)];
    lib.addItems(items);
    expect(useLibraryStore.getState().items).toHaveLength(4);
    expect(useLibraryStore.getState().getSorted().map((i) => i.id)).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);

    // 切到按名称排序再切回自定义：手动顺序不丢
    useLibraryStore.getState().setSortMode("name");
    useLibraryStore.getState().setSortMode("custom");
    expect(useLibraryStore.getState().getSorted().map((i) => i.id)).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);

    // ---- 2. 模板：4 张图填四分格 ----
    const tpl = findTemplate("grid-2x2")!;
    const sources = fillSourcesOf(useLibraryStore.getState().getSorted());
    doc.commit((d) => applyTemplate(d, tpl, sources, (i) => `new-${i}`), {
      label: "应用模板：四分格",
    });

    const cur = useDocStore.getState().doc;
    expect(cur.instances).toHaveLength(4);
    expect(emptyCellIndices(cur, tpl)).toEqual([]);

    // 每格与模板矩形逐一对应，且不越画布
    const frames = templateFrames(tpl, cur.canvas, cur.gap);
    cur.instances.forEach((inst, i) => {
      expect(inst.frame).toEqual(frames[i]);
      expect(inst.frame.x).toBeGreaterThanOrEqual(0);
      expect(inst.frame.y).toBeGreaterThanOrEqual(0);
      expect(inst.frame.x + inst.frame.w).toBeLessThanOrEqual(cur.canvas.width);
      expect(inst.frame.y + inst.frame.h).toBeLessThanOrEqual(cur.canvas.height);
    });

    // ---- 3. 编辑：裁剪、旋转、透明度、边框、圆角，各一次提交 ----
    const target = cur.instances[0].id;
    const { commit } = useDocStore.getState();
    commit((d) => setCrop(d, target, { x: 120, y: 80, w: 2000, h: 1500 }, { w: 4000, h: 3000 }), {
      label: "裁剪图片",
    });
    commit((d) => rotateInstance(d, target, 90), { label: "旋转图片" });
    commit((d) => updateInstance(d, target, { opacity: 0.5 }), { label: "调整不透明度" });
    commit((d) => updateInstance(d, target, { border: { width: 6, color: "#e0457b" } }), {
      label: "调整边框",
    });
    commit((d) => updateInstance(d, target, { cornerRadius: 18 }), { label: "调整圆角" });

    const edited = useDocStore.getState().doc.instances[0];
    expect(edited.crop).toEqual({ x: 120, y: 80, w: 2000, h: 1500 });
    expect(edited.rotation).toBe(90);
    expect(edited.opacity).toBe(0.5);
    expect(edited.border.width).toBe(6);
    expect(edited.cornerRadius).toBe(18);

    // ---- 4. 撤销 5 次回到模板刚应用后，重做 5 次回到编辑完成态 ----
    for (let i = 0; i < 5; i++) useDocStore.getState().undo();
    const undone = useDocStore.getState().doc.instances.find((i) => i.id === target)!;
    expect(undone.crop).toEqual({ x: 0, y: 0, w: 4000, h: 3000 });
    expect(undone.rotation).toBe(0);
    expect(undone.opacity).toBe(1);
    expect(undone.border.width).toBe(0);
    expect(undone.cornerRadius).toBe(0);
    expect(undone.frame).toEqual(frames[0]);

    for (let i = 0; i < 5; i++) useDocStore.getState().redo();
    const redone = useDocStore.getState().doc.instances.find((i) => i.id === target)!;
    expect(redone.opacity).toBe(0.5);
    expect(redone.cornerRadius).toBe(18);

    // ---- 5. 导出：2400 × 20000 的可信计划 ----
    const finalDoc = useDocStore.getState().doc;
    expect(validateExportSize(finalDoc.canvas.width, MAX_EXPORT_EDGE)).toBeNull();

    const strips = planStrips(MAX_EXPORT_EDGE);
    expect(strips).toHaveLength(10);
    // 覆盖 [0,20000) 且无缝无重
    expect(strips[0].rowStart).toBe(0);
    for (let i = 1; i < strips.length; i++) {
      expect(strips[i].rowStart).toBe(strips[i - 1].rowStart + strips[i - 1].rows);
    }
    const last = strips[strips.length - 1];
    expect(last.rowStart + last.rows).toBe(MAX_EXPORT_EDGE);
    // 每条都渲染了重叠行，但不越过底边
    for (const s of strips) {
      expect(s.renderRows).toBeGreaterThanOrEqual(s.rows);
      expect(s.rowStart + s.renderRows).toBeLessThanOrEqual(MAX_EXPORT_EDGE);
    }

    // 文件名与格式一致
    expect(ensureExtension(defaultExportName("jpeg"), "png")).toMatch(/\.png$/);
  });
});

describe("端到端：中途释放资源（T12.2）", () => {
  it("释放条目级联移除实例、腾出空格，撤销不会复活已释放的实例", () => {
    const tpl = findTemplate("grid-3x2")!;
    const items = [item(1), item(2), item(3), item(4)];
    useLibraryStore.getState().addItems(items);

    const { commit, commitNoHistory, undo } = useDocStore.getState();
    commit(
      (d) => applyTemplate(d, tpl, fillSourcesOf(items), (i) => `new-${i}`),
      { label: "应用模板：六分格" },
    );

    // 6 格 4 图 → 2 空格
    expect(useDocStore.getState().doc.instances).toHaveLength(4);
    expect(emptyCellIndices(useDocStore.getState().doc, tpl)).toHaveLength(2);

    // 释放第 2 张：资源库条目与关联实例同时消失，且不进撤销历史
    const before = useDocStore.getState().past.length;
    useLibraryStore.getState().removeItem("item-2");
    // 这里必须是数组：传单个字符串是类型错误；而一旦绕过类型检查，
    // new Set("item-2") 会变成字符集合，静默什么都不删——失败得毫无声响。
    commitNoHistory((d) => removeInstancesByLibraryItem(d, ["item-2"]));

    expect(useDocStore.getState().past).toHaveLength(before);
    expect(useDocStore.getState().doc.instances).toHaveLength(3);
    expect(useDocStore.getState().doc.instances.some((i) => i.libraryItemId === "item-2")).toBe(false);
    expect(emptyCellIndices(useDocStore.getState().doc, tpl)).toHaveLength(3);

    // 撤销一步：回到"应用模板"之前，但绝不能把已释放条目的实例带回来
    undo();
    const afterUndo = useDocStore.getState().doc;
    expect(afterUndo.instances.some((i) => i.libraryItemId === "item-2")).toBe(false);
    // 而且撤销后不能出现"引用了不存在条目"的实例
    const aliveIds = new Set(useLibraryStore.getState().items.map((i) => i.id));
    for (const inst of afterUndo.instances) {
      expect(aliveIds.has(inst.libraryItemId)).toBe(true);
    }

    // 重新套模板（4 张变 3 张）→ 3 实例 3 空格
    commit(
      (d) => applyTemplate(d, tpl, fillSourcesOf(useLibraryStore.getState().getSorted()), (i) => `again-${i}`),
      { label: "重新应用模板" },
    );
    expect(useDocStore.getState().doc.instances).toHaveLength(3);
    expect(emptyCellIndices(useDocStore.getState().doc, tpl)).toHaveLength(3);

    // 补一张新图填进第一个空格 → 4 实例 2 空格，且新实例落在空格位置上
    const fresh = item(6);
    useLibraryStore.getState().addItems([fresh]);
    const firstEmpty = emptyCellIndices(useDocStore.getState().doc, tpl)[0];
    commit(
      (d) =>
        placeIntoCell(
          d,
          tpl,
          firstEmpty,
          { itemId: fresh.id, width: fresh.width, height: fresh.height },
          "filled-1",
        ),
      { label: "放入单元格" },
    );

    const finalDoc = useDocStore.getState().doc;
    expect(finalDoc.instances).toHaveLength(4);
    expect(emptyCellIndices(finalDoc, tpl)).toHaveLength(2);
    const placed = finalDoc.instances.find((i) => i.id === "filled-1")!;
    expect(placed.frame).toEqual(templateFrames(tpl, finalDoc.canvas, finalDoc.gap)[firstEmpty]);
  });
});

describe("端到端：排序变化影响填充结果（可解释性）", () => {
  it("按名称倒序填充时，第一格拿到的是名称序第一张", () => {
    const a = item(2);
    const b = item(1);
    useLibraryStore.getState().addItems([a, b]);
    useLibraryStore.getState().setSortMode("name");

    const ordered = sortLibrary(useLibraryStore.getState().items, "name", []);
    const tpl = findTemplate("grid-2x2")!;
    useDocStore.getState().commit(
      (d) => applyTemplate(d, tpl, fillSourcesOf(ordered), (i) => `n-${i}`),
      { label: "应用模板" },
    );

    const first = useDocStore.getState().doc.instances[0];
    expect(first.libraryItemId).toBe(ordered[0].id);

    // 手动把顺序反过来，再套一次模板：第一格换人，但实例 id 集合仍是同一批条目
    const reversed = moveInOrder(
      useLibraryStore.getState().items.map((i) => i.id),
      0,
      1,
    );
    useLibraryStore.getState().setSortMode("custom");
    const reordered = sortLibrary(
      useLibraryStore.getState().items,
      "custom",
      reversed,
    );
    useDocStore.getState().commit(
      (d) => applyTemplate(d, tpl, fillSourcesOf(reordered), (i) => `m-${i}`),
      { label: "重新应用模板" },
    );
    expect(useDocStore.getState().doc.instances[0].libraryItemId).toBe(reordered[0].id);
  });
});

describe("端到端：空文档直接导出", () => {
  it("没有实例时导出计划仍然完整（导出的是背景，不是失败）", () => {
    const doc = createEmptyDocument();
    expect(doc.instances).toHaveLength(0);
    expect(validateExportSize(doc.canvas.width, doc.canvas.height)).toBeNull();
    const strips = planStrips(doc.canvas.height);
    expect(strips[0].rowStart).toBe(0);
    expect(strips[strips.length - 1].rowStart + strips[strips.length - 1].rows).toBe(doc.canvas.height);
  });
});

describe("端到端：单实例反复编辑不产生游离实例", () => {
  it("同一张图放两次 → 模板只留一格，另一个实例被移出画布但条目仍在", () => {
    const one = item(1);
    useLibraryStore.getState().addItems([one]);

    const { commit } = useDocStore.getState();
    // 手动放两次（模拟用户把同一张图拖进画布两次）
    commit(
      (d) =>
        addInstance(
          d,
          createInstance(d, {
            id: "dup-a",
            libraryItemId: one.id,
            sourceWidth: one.width,
            sourceHeight: one.height,
            frame: { x: 0, y: 0, w: 400, h: 300 },
          }),
        ),
      { label: "放入图片" },
    );
    commit(
      (d) =>
        addInstance(
          d,
          createInstance(d, {
            id: "dup-b",
            libraryItemId: one.id,
            sourceWidth: one.width,
            sourceHeight: one.height,
            frame: { x: 500, y: 0, w: 400, h: 300 },
          }),
        ),
      { label: "放入图片" },
    );
    expect(useDocStore.getState().doc.instances).toHaveLength(2);

    const tpl = findTemplate("grid-2x2")!;
    commit((d) => applyTemplate(d, tpl, fillSourcesOf([one]), (i) => `t-${i}`), {
      label: "应用模板",
    });

    const after = useDocStore.getState().doc;
    expect(after.instances).toHaveLength(1);
    // 复用最早创建的那个
    expect(after.instances[0].id).toBe("dup-a");
    // 资源库条目一个都没少
    expect(useLibraryStore.getState().items).toHaveLength(1);
  });
});

describe("跨语言常量一致性", () => {
  /**
   * 导出缓冲上限在前后端各有一份：前端用它提前给出可读错误，
   * Rust 用它真正拦截。两份一旦漂移，会出现"前端说能导、后端报内存不足"
   * 或者反过来"前端拦住了、其实后端能过"——都极难解释。
   *
   * 没法在编译期共享常量，就把漂移本身变成测试失败。
   */
  it("domain/export.ts 的 MAX_RGBA_BYTES 与 Rust 侧一致", async () => {
    const raw = import.meta.glob("../../src-tauri/src/commands/export.rs", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const text = Object.values(raw)[0] ?? "";
    expect(text.length).toBeGreaterThan(1000);

    const m = /MAX_RGBA_BYTES:\s*u64\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)\s*;/.exec(text);
    expect(m, "Rust 侧应保留 `MAX_RGBA_BYTES: u64 = A * B * C;` 的写法").not.toBeNull();

    const rustValue = Number(m![1]) * Number(m![2]) * Number(m![3]);
    const { MAX_RGBA_BYTES } = await import("../domain/export");
    expect(rustValue).toBe(MAX_RGBA_BYTES);
  });
});
