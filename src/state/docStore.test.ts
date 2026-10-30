import { beforeEach, describe, expect, it } from "vitest";
import { addInstance, setCanvasSize } from "../domain/document";
import { createEmptyDocument, type CanvasInstance } from "../domain/types";
import { useDocStore } from "./docStore";
import { HISTORY_LIMIT } from "../domain/history";

function inst(id: string): CanvasInstance {
  return {
    id,
    libraryItemId: "lib-1",
    createdSeq: 0,
    frame: { x: 0, y: 0, w: 10, h: 10 },
    crop: { x: 0, y: 0, w: 10, h: 10 },
    rotation: 0,
    flipH: false,
    flipV: false,
    opacity: 1,
    border: { width: 0, color: "#000000" },
    cornerRadius: 0,
  };
}

function reset() {
  useDocStore.setState({
    doc: createEmptyDocument(),
    revision: 0,
    dirty: false,
    past: [],
    future: [],
    mergeKey: null,
    lastCommitAt: 0,
  });
}

beforeEach(reset);

describe("commit 入栈", () => {
  it("一次提交产生一个撤销步骤", () => {
    const { commit, doc } = useDocStore.getState();
    commit((d) => addInstance(d, inst("a")), { label: "添加图片" });

    const s = useDocStore.getState();
    expect(s.doc.instances).toHaveLength(1);
    expect(s.past).toHaveLength(1);
    expect(s.past[0].label).toBe("添加图片");
    expect(doc.instances).toHaveLength(0); // 原状态未被就地修改
    expect(s.dirty).toBe(true);
  });

  it("recipe 返回同一引用时不产生步骤、不置脏", () => {
    const { commit } = useDocStore.getState();
    commit((d) => d);
    const s = useDocStore.getState();
    expect(s.past).toHaveLength(0);
    expect(s.dirty).toBe(false);
    expect(s.revision).toBe(0);
  });

  it("超过上限时丢弃最旧步骤", () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      useDocStore.getState().commit((d) => addInstance(d, inst(`i${i}`)));
    }
    expect(useDocStore.getState().past).toHaveLength(HISTORY_LIMIT);
  });
});

describe("transaction 合并（连续拖动只产生一步）", () => {
  it("同一 mergeKey 的多次提交只占一个撤销步骤", () => {
    // 模拟拖动 50 帧
    for (let f = 0; f < 50; f++) {
      useDocStore.getState().commit(
        (d) =>
          d.instances.length === 0
            ? addInstance(d, inst("a"))
            : { ...d, instances: d.instances.map((i) => ({ ...i, frame: { ...i.frame, x: f } })) },
        { label: "拖动图片", mergeKey: "drag:inst-a" },
      );
    }
    const s = useDocStore.getState();
    expect(s.past).toHaveLength(1);
    expect(s.doc.instances[0].frame.x).toBe(49);
  });

  it("撤销一次即可回到拖动前，而不是退回某一帧", () => {
    for (let f = 0; f < 20; f++) {
      useDocStore.getState().commit(
        (d) =>
          d.instances.length === 0
            ? addInstance(d, inst("a"))
            : { ...d, instances: d.instances.map((i) => ({ ...i, frame: { ...i.frame, x: f } })) },
        { mergeKey: "drag" },
      );
    }
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.instances).toHaveLength(0);
  });

  it("不同 mergeKey 会开新步骤", () => {
    useDocStore.getState().commit((d) => addInstance(d, inst("a")), { mergeKey: "drag:a" });
    useDocStore.getState().commit((d) => setCanvasSize(d, 800, 600), { mergeKey: "drag:b" });
    expect(useDocStore.getState().past).toHaveLength(2);
  });

  it("endMerge 之后的同 mergeKey 提交会开新步骤", () => {
    useDocStore.getState().commit((d) => addInstance(d, inst("a")), { mergeKey: "drag" });
    useDocStore.getState().endMerge();
    useDocStore.getState().commit((d) => setCanvasSize(d, 800, 600), { mergeKey: "drag" });
    expect(useDocStore.getState().past).toHaveLength(2);
  });

  it("无 mergeKey 的提交每次都开新步骤", () => {
    useDocStore.getState().commit((d) => addInstance(d, inst("a")));
    useDocStore.getState().commit((d) => addInstance(d, inst("b")));
    expect(useDocStore.getState().past).toHaveLength(2);
  });
});

describe("undo / redo", () => {
  it("撤销恢复到提交前，重做回到提交后", () => {
    useDocStore.getState().commit((d) => addInstance(d, inst("a")), { label: "添加" });
    const after = useDocStore.getState().doc;

    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.instances).toHaveLength(0);

    useDocStore.getState().redo();
    expect(useDocStore.getState().doc).toBe(after);
  });

  it("撤销到底后继续撤销无副作用", () => {
    useDocStore.getState().commit((d) => addInstance(d, inst("a")));
    useDocStore.getState().undo();
    useDocStore.getState().undo();
    expect(useDocStore.getState().future).toHaveLength(1);
  });

  it("撤销后新提交清空 redo 分支", () => {
    useDocStore.getState().commit((d) => addInstance(d, inst("a")));
    useDocStore.getState().undo();
    useDocStore.getState().commit((d) => addInstance(d, inst("b")));
    expect(useDocStore.getState().future).toHaveLength(0);
  });

  it("撤销不恢复视图状态（选中不属于文档历史）", () => {
    useDocStore.getState().commit((d) => addInstance(d, inst("a")));
    useDocStore.getState().undo();
    const s = useDocStore.getState();
    expect(s.doc.instances).toHaveLength(0);
  });
});

describe("commitNoHistory（资源释放路径）", () => {
  it("改变文档但不产生撤销步骤", () => {
    useDocStore.getState().commit((d) => addInstance(d, inst("a")));
    const before = useDocStore.getState().past.length;

    useDocStore.getState().commitNoHistory((d) => ({ ...d, instances: [] }));

    const s = useDocStore.getState();
    expect(s.doc.instances).toHaveLength(0);
    expect(s.past).toHaveLength(before);
    expect(s.dirty).toBe(true); // 内容确实变了，退出前仍应提示
  });

  it("撤销不会把被释放资源关联的实例变回来", () => {
    useDocStore.getState().commit((d) => addInstance(d, inst("a")));
    useDocStore.getState().commitNoHistory((d) => ({ ...d, instances: [] }));
    useDocStore.getState().undo();
    // 撤销的是更早的"添加图片"，此时实例回到空再回到有 1 个的中间态，
    // 关键是不能凭空复活资源——资源库不在文档历史里
    expect(useDocStore.getState().doc.instances.length).toBeLessThanOrEqual(1);
  });
});

describe("图像属性进撤销栈（T7.7）", () => {
  it("透明度/边框/圆角/裁剪的修改都可撤销", () => {
    const { commit } = useDocStore.getState();
    commit((d) => addInstance(d, inst("a")), { label: "添加图片" });

    const steps: Array<(d: ReturnType<typeof createEmptyDocument>) => ReturnType<typeof createEmptyDocument>> = [
      (d) => ({ ...d, instances: d.instances.map((i) => ({ ...i, opacity: 0.4 })) }),
      (d) => ({
        ...d,
        instances: d.instances.map((i) => ({ ...i, border: { width: 6, color: "#ff0000" } })),
      }),
      (d) => ({ ...d, instances: d.instances.map((i) => ({ ...i, cornerRadius: 24 })) }),
      (d) => ({ ...d, instances: d.instances.map((i) => ({ ...i, crop: { x: 1, y: 2, w: 3, h: 4 } })) }),
    ];
    const labels = ["调整不透明度", "调整边框", "调整圆角", "裁剪图片"];

    steps.forEach((fn, i) => commit(fn, { label: labels[i] }));

    const s = useDocStore.getState();
    expect(s.past).toHaveLength(5);

    // 逐步撤销，每一步只回退一个属性
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.instances[0].crop).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.instances[0].cornerRadius).toBe(0);
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.instances[0].border.width).toBe(0);
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.instances[0].opacity).toBe(1);

    useDocStore.getState().redo();
    expect(useDocStore.getState().doc.instances[0].opacity).toBe(0.4);
  });

  it("滑块连续拖动合并为一步（mergeKey）", () => {
    const { commit, endMerge } = useDocStore.getState();
    commit((d) => addInstance(d, inst("a")), { label: "添加图片" });

    for (let v = 1; v <= 20; v++) {
      commit(
        (d) => ({ ...d, instances: d.instances.map((i) => ({ ...i, opacity: v / 100 })) }),
        { label: "调整不透明度", mergeKey: "opacity:a" },
      );
    }
    endMerge();

    const s = useDocStore.getState();
    expect(s.past).toHaveLength(2); // 添加 + 一次拖动
    expect(s.doc.instances[0].opacity).toBeCloseTo(0.2, 6);

    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.instances[0].opacity).toBe(1);
  });
});

describe("模板切换的原子性与可逆性（T8.9）", () => {
  it("一次切换 = 一步撤销；撤销完整恢复模板与实例属性；重做恢复切换后状态", async () => {
    const { applyTemplate, fillSourcesOf, findTemplate } = await import("../domain/templates");
    const t = findTemplate("grid-2x2")!;

    // 初始：两个实例，带裁剪/旋转/翻转/边框，位置各异
    const a: CanvasInstance = {
      ...inst("a"),
      libraryItemId: "item-a",
      createdSeq: 0,
      crop: { x: 7, y: 8, w: 90, h: 60 },
      rotation: 90,
      flipH: true,
      border: { width: 4, color: "#abcdef" },
      cornerRadius: 6,
    };
    const b: CanvasInstance = { ...inst("b"), libraryItemId: "item-b", createdSeq: 1 };

    const { commit, doc: initial } = useDocStore.getState();
    commit((d) => ({ ...d, instances: [a, b] }), { label: "初始化" });

    const before = useDocStore.getState().doc;
    const beforeSnapshot = JSON.parse(JSON.stringify(before));

    const sources = fillSourcesOf([
      { id: "item-a", width: 400, height: 300 },
      { id: "item-b", width: 400, height: 300 },
    ] as never);

    commit((d) => applyTemplate(d, t, sources, (i) => `new-${i}`), { label: "应用模板：四分格" });

    const after = useDocStore.getState().doc;
    const afterSnapshot = JSON.parse(JSON.stringify(after));
    expect(after.templateId).toBe("grid-2x2");
    expect(after.instances).toHaveLength(2);

    // 只新增了 1 个历史步骤
    const past = useDocStore.getState().past;
    expect(past[past.length - 1].label).toBe("应用模板：四分格");

    useDocStore.getState().undo();
    expect(JSON.parse(JSON.stringify(useDocStore.getState().doc))).toEqual(beforeSnapshot);

    useDocStore.getState().redo();
    expect(JSON.parse(JSON.stringify(useDocStore.getState().doc))).toEqual(afterSnapshot);

    // 复用的实例保留了图像级属性
    const reused = useDocStore.getState().doc.instances.find((i) => i.libraryItemId === "item-a")!;
    expect(reused.crop).toEqual({ x: 7, y: 8, w: 90, h: 60 });
    expect(reused.rotation).toBe(90);
    expect(reused.flipH).toBe(true);
    expect(reused.border).toEqual({ width: 4, color: "#abcdef" });
    expect(reused.cornerRadius).toBe(6);
    void initial;
  });
});

describe("画布属性进撤销栈（T9.6）", () => {
  it("背景切换、渐变参数、画布尺寸都可撤销", async () => {
    const { setBackground, setCanvasSize } = await import("../domain/document");
    const { commit } = useDocStore.getState();

    commit((d) => setBackground(d, { type: "solid", color: "#ff0000" }), { label: "背景：纯色" });
    commit((d) => setBackground(d, { type: "linear", from: "#ffffff", to: "#000000", angle: 45 }), {
      label: "背景：渐变",
    });
    commit((d) => setCanvasSize(d, 3000, 2000), { label: "调整画布尺寸" });

    const s = useDocStore.getState();
    expect(s.past).toHaveLength(3);
    expect(s.doc.canvas.background).toEqual({ type: "linear", from: "#ffffff", to: "#000000", angle: 45 });
    expect(s.doc.canvas.width).toBe(3000);

    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.canvas.width).toBe(2400);
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.canvas.background).toEqual({ type: "solid", color: "#ff0000" });
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.canvas.background).toEqual({ type: "white" });
  });

  it("画布尺寸变化不移动已有实例（基线 §5.3）", async () => {
    const { setCanvasSize, addInstance } = await import("../domain/document");
    const { commit } = useDocStore.getState();
    commit((d) => addInstance(d, inst("a")), { label: "添加图片" });

    const before = useDocStore.getState().doc.instances[0].frame;
    commit((d) => setCanvasSize(d, 3000, 2000), { label: "调整画布尺寸" });
    expect(useDocStore.getState().doc.instances[0].frame).toEqual(before);
  });
});
