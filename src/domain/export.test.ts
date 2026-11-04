import { describe, expect, it } from "vitest";
import {
  defaultExportName,
  ensureExtension,
  heightForWidth,
  MAX_EXPORT_EDGE,
  planStrips,
  STRIP_H,
  transparencyNote,
  validateExportSize,
  widthForHeight,
} from "./export";
import { createEmptyDocument, DEFAULT_CANVAS } from "./types";

describe("planStrips：接缝来源", () => {
  it("高度小于一条时只有一条，且不额外渲染重叠行", () => {
    expect(planStrips(1600)).toEqual([{ index: 0, rowStart: 0, rows: 1600, renderRows: 1600 }]);
  });

  it("正好等于条带高度时仍然只有一条", () => {
    expect(planStrips(STRIP_H)).toEqual([
      { index: 0, rowStart: 0, rows: STRIP_H, renderRows: STRIP_H },
    ]);
  });

  it("多 1px 就切两条，中间条带多渲染 1 行重叠", () => {
    const s = planStrips(STRIP_H + 1);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ index: 0, rowStart: 0, rows: STRIP_H, renderRows: STRIP_H + 1 });
    expect(s[1]).toEqual({ index: 1, rowStart: STRIP_H, rows: 1, renderRows: 1 });
  });

  it("三条时只有最后一条不重叠，且总写入行数等于总高度", () => {
    const h = STRIP_H * 2 + 100;
    const s = planStrips(h);
    expect(s).toHaveLength(3);
    expect(s[0].renderRows).toBe(STRIP_H + 1);
    expect(s[1].renderRows).toBe(STRIP_H + 1);
    expect(s[2].renderRows).toBe(100);
    expect(s.reduce((sum, x) => sum + x.rows, 0)).toBe(h);
    // 每条渲染行不能越过画布底边
    for (const x of s) expect(x.rowStart + x.renderRows).toBeLessThanOrEqual(h);
  });

  it("20,000 px 上限下切成 10 条", () => {
    expect(planStrips(20000)).toHaveLength(10);
  });

  it("非法输入返回空数组", () => {
    expect(planStrips(0)).toEqual([]);
    expect(planStrips(-10)).toEqual([]);
    expect(planStrips(Number.NaN)).toEqual([]);
  });
});

describe("validateExportSize", () => {
  it("常见尺寸通过", () => {
    expect(validateExportSize(2400, 1600)).toBeNull();
    expect(validateExportSize(20000, 20000)).toContain("安全内存");
  });

  it("超过单边上限时给出可执行的说明", () => {
    const msg = validateExportSize(MAX_EXPORT_EDGE + 1, 100);
    expect(msg).toContain("单边上限");
    expect(msg).toContain("20000");
  });

  it("宽高为零或负数被拒", () => {
    expect(validateExportSize(0, 100)).toContain("至少为 1");
    expect(validateExportSize(100, -1)).toContain("至少为 1");
  });

  it("非数字被拒", () => {
    expect(validateExportSize(Number.NaN, 100)).toContain("必须是数字");
  });
});

describe("宽高比联动", () => {
  it("按 3:2 画布换算", () => {
    expect(heightForWidth(3000, DEFAULT_CANVAS)).toBe(2000);
    expect(widthForHeight(2000, DEFAULT_CANVAS)).toBe(3000);
  });

  it("最小值不低于 1", () => {
    const doc = createEmptyDocument();
    expect(heightForWidth(1, { ...doc.canvas, width: 10000, height: 1 })).toBe(1);
  });
});

describe("默认文件名", () => {
  it("格式为 拼图_YYYYMMDD_HHMMSS.ext", () => {
    const d = new Date(2026, 9, 30, 9, 5, 3);
    expect(defaultExportName("png", d)).toBe("拼图_20261030_090503.png");
    expect(defaultExportName("jpeg", d)).toBe("拼图_20261030_090503.jpg");
  });

  it("扩展名被强制纠正为与格式一致", () => {
    expect(ensureExtension("我的拼图.png", "jpeg")).toBe("我的拼图.jpg");
    expect(ensureExtension("a.jpeg", "png")).toBe("a.png");
    expect(ensureExtension("无扩展名", "png")).toBe("无扩展名.png");
  });
});

describe("透明说明", () => {
  it("PNG + 透明：说明会保留且不导出棋盘格", () => {
    expect(transparencyNote("png", "transparent")).toContain("保留透明");
    expect(transparencyNote("png", "transparent")).toContain("棋盘格");
  });

  it("JPEG + 透明：说明会用白色合成", () => {
    expect(transparencyNote("jpeg", "transparent")).toContain("白色");
  });

  it("非透明背景不误导用户", () => {
    expect(transparencyNote("jpeg", "linear")).not.toContain("透明");
    expect(transparencyNote("png", "solid")).toContain("无损");
  });
});
