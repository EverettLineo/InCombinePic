import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  emptyHistory,
  nextUndoLabel,
  record,
  redo,
  undo,
} from "./history";
import { addInstance, setCanvasSize } from "./document";
import { createEmptyDocument, type CanvasInstance, type DocumentState } from "./types";

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

/** 构造一段"初始 → 加实例 → 改尺寸"的历史 */
function scenario() {
  const s0 = createEmptyDocument();
  let h = emptyHistory();

  h = record(h, "添加图片", s0);
  const s1: DocumentState = addInstance(s0, inst("a"));

  h = record(h, "改画布尺寸", s1);
  const s2: DocumentState = setCanvasSize(s1, 1200, 900);

  return { s0, s1, s2, h };
}

describe("record / 基本性质", () => {
  it("记录后 canUndo 为真、canRedo 为假", () => {
    const { h } = scenario();
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
  });

  it("空历史不能撤销", () => {
    expect(undo(emptyHistory(), createEmptyDocument())).toBeNull();
  });

  it("空 history 的 nextUndoLabel 为 null", () => {
    expect(nextUndoLabel(emptyHistory())).toBeNull();
  });

  it("超过上限时丢弃最旧记录", () => {
    let h = emptyHistory();
    const doc = createEmptyDocument();
    for (let i = 0; i < 5; i++) {
      h = record(h, `第${i}步`, doc, 3);
    }
    expect(h.past).toHaveLength(3);
    // 保留的是最近三步
    expect(h.past.map((e) => e.label)).toEqual(["第2步", "第3步", "第4步"]);
  });
});

describe("undo / redo", () => {
  it("撤销恢复到上一个状态", () => {
    const { s1, s2, h } = scenario();
    const step = undo(h, s2)!;
    expect(step.state).toBe(s1);
    expect(canRedo(step.history)).toBe(true);
  });

  it("重做回到撤销前的状态", () => {
    const { s2, h } = scenario();
    const undone = undo(h, s2)!;
    const redone = redo(undone.history, undone.state)!;
    expect(redone.state).toBe(s2);
  });

  it("连续撤销两次可回到初始状态", () => {
    const { s0, s2, h } = scenario();
    const u1 = undo(h, s2)!;
    const u2 = undo(u1.history, u1.state)!;
    expect(u2.state).toBe(s0);
    expect(canUndo(u2.history)).toBe(false);
  });

  it("撤销栈耗尽后返回 null", () => {
    const { s2, h } = scenario();
    const u1 = undo(h, s2)!;
    const u2 = undo(u1.history, u1.state)!;
    expect(undo(u2.history, u2.state)).toBeNull();
  });

  it("新编辑会清空 redo 分支", () => {
    const { s2, h } = scenario();
    const undone = undo(h, s2)!;
    const branched = record(undone.history, "新操作", undone.state);
    expect(canRedo(branched)).toBe(false);
  });

  it("撤销后重做栈里保留的是被撤销的那一刻状态", () => {
    const { s2, h } = scenario();
    const step = undo(h, s2)!;
    expect(step.history.future).toHaveLength(1);
    expect(step.history.future[0].snapshot).toBe(s2);
  });
});

describe("nextUndoLabel", () => {
  it("返回栈顶操作名，供界面提示", () => {
    const { h } = scenario();
    expect(nextUndoLabel(h)).toBe("改画布尺寸");
  });
});
