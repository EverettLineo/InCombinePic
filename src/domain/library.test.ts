import { describe, expect, it } from "vitest";
import { moveInOrder, reconcileCustomOrder, sortLibrary } from "./library";
import type { LibraryItem } from "./types";

function item(id: string, fileName: string, importSeq: number, importedAt = 1000 + importSeq): LibraryItem {
  return {
    id,
    sourcePath: `C:/img/${fileName}`,
    fileName,
    importSeq,
    importedAt,
    width: 100,
    height: 100,
    format: "png",
    hasAlpha: false,
  };
}

const A = item("a", "b.png", 0, 1000);
const B = item("b", "a.png", 1, 1001);
const C = item("c", "c.png", 2, 1002);

describe("sortLibrary / custom", () => {
  it("按自定义顺序返回，不受导入序影响", () => {
    const out = sortLibrary([A, B, C], "custom", ["c", "a", "b"]);
    expect(out.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("未出现在自定义顺序中的条目排在最后", () => {
    const out = sortLibrary([A, B, C], "custom", ["c"]);
    expect(out.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("不修改入参数组", () => {
    const input = [A, B, C];
    sortLibrary(input, "custom", ["c", "a", "b"]);
    expect(input.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("sortLibrary / name", () => {
  it("按文件名排序", () => {
    const out = sortLibrary([A, B, C], "name", []);
    expect(out.map((i) => i.fileName)).toEqual(["a.png", "b.png", "c.png"]);
  });

  it("同名文件用导入序号做稳定次级排序（避免顺序跳动）", () => {
    const x1 = item("x1", "same.png", 5);
    const x2 = item("x2", "same.png", 2);
    const out = sortLibrary([x1, x2], "name", []);
    expect(out.map((i) => i.id)).toEqual(["x2", "x1"]);
  });

  it("文件名中的数字按数值比较，img2 排在 img10 之前", () => {
    const i2 = item("i2", "img2.png", 0);
    const i10 = item("i10", "img10.png", 1);
    const out = sortLibrary([i10, i2], "name", []);
    expect(out.map((i) => i.id)).toEqual(["i2", "i10"]);
  });
});

describe("sortLibrary / importedAt", () => {
  it("按导入时间正序", () => {
    const out = sortLibrary([C, A, B], "importedAt", []);
    expect(out.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("同一毫秒以导入序号兜底，结果稳定", () => {
    const p = item("p", "p.png", 3, 2000);
    const q = item("q", "q.png", 1, 2000);
    expect(sortLibrary([p, q], "importedAt", []).map((i) => i.id)).toEqual(["q", "p"]);
  });
});

describe("排序模式切换不破坏自定义顺序", () => {
  it("切到文件名排序再切回自定义，恢复原手动顺序", () => {
    const items = [A, B, C];
    const custom = ["b", "c", "a"];
    expect(sortLibrary(items, "name", custom).map((i) => i.id)).toEqual(["b", "a", "c"]);
    // 切回自定义，仍按保存的顺序
    expect(sortLibrary(items, "custom", custom).map((i) => i.id)).toEqual(["b", "c", "a"]);
  });
});

describe("reconcileCustomOrder", () => {
  it("移除已释放条目的 id，并把新条目追加到末尾", () => {
    const items = [A, C]; // B 已被释放
    const order = reconcileCustomOrder(items, ["b", "c", "a"]);
    expect(order).toEqual(["c", "a"]);
  });

  it("新导入条目追加到末尾，不插入中间", () => {
    const items = [A, B, C];
    const order = reconcileCustomOrder(items, ["c", "a"]);
    expect(order).toEqual(["c", "a", "b"]);
  });
});

describe("moveInOrder", () => {
  it("移动条目位置", () => {
    expect(moveInOrder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("越界返回副本而非原引用", () => {
    const order = ["a", "b"];
    const out = moveInOrder(order, 0, 9);
    expect(out).toEqual(order);
    expect(out).not.toBe(order);
  });
});
