import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, normalizePrefs, parsePrefs } from "./prefsStore";

describe("normalizePrefs 白名单", () => {
  it("非对象一律回默认值", () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs("abc")).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs(42)).toEqual(DEFAULT_PREFS);
  });

  it("未知字段不会带进来（白名单而非黑名单）", () => {
    const p = normalizePrefs({ ...DEFAULT_PREFS, hack: "x", instances: [1, 2] });
    expect(Object.keys(p).sort()).toEqual(Object.keys(DEFAULT_PREFS).sort());
  });

  it("质量被夹到 60~100", () => {
    expect(normalizePrefs({ jpegQuality: 5 }).jpegQuality).toBe(60);
    expect(normalizePrefs({ jpegQuality: 500 }).jpegQuality).toBe(100);
    expect(normalizePrefs({ jpegQuality: 92.6 }).jpegQuality).toBe(93);
    expect(normalizePrefs({ jpegQuality: "80" }).jpegQuality).toBe(92);
  });

  it("画布尺寸被夹到 64~20000", () => {
    expect(normalizePrefs({ canvasWidth: 1 }).canvasWidth).toBe(64);
    expect(normalizePrefs({ canvasHeight: 99999 }).canvasHeight).toBe(20000);
  });

  it("非法的枚举值回落到默认项", () => {
    const p = normalizePrefs({ exportFormat: "gif", librarySort: "magic", rightTab: 1 });
    expect(p.exportFormat).toBe("png");
    expect(p.librarySort).toBe("custom");
    expect(p.rightTab).toBe("props");
  });

  it("合法枚举值被保留", () => {
    const p = normalizePrefs({
      exportFormat: "jpeg",
      librarySort: "name",
      rightTab: "templates",
    });
    expect(p.exportFormat).toBe("jpeg");
    expect(p.librarySort).toBe("name");
    // 模板已移到右栏，属于合法的右栏标签
    expect(p.rightTab).toBe("templates");
  });
});

describe("parsePrefs（磁盘内容可能损坏）", () => {
  it("空文本回默认值", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("")).toEqual(DEFAULT_PREFS);
  });

  it("坏 JSON 不抛异常，回默认值", () => {
    expect(parsePrefs("{oops")).toEqual(DEFAULT_PREFS);
  });

  it("合法 JSON 只取白名单字段", () => {
    const p = parsePrefs(JSON.stringify({ exportFormat: "jpeg", jpegQuality: 80 }));
    expect(p.exportFormat).toBe("jpeg");
    expect(p.jpegQuality).toBe(80);
    expect(p.canvasWidth).toBe(DEFAULT_PREFS.canvasWidth);
  });

  it("偏好里混入文档内容也不会被采纳", () => {
    const p = parsePrefs(JSON.stringify({ canvasWidth: 3000, instances: [{ id: "a" }] }));
    expect(p.canvasWidth).toBe(3000);
    expect("instances" in p).toBe(false);
  });
});

describe("观感与性能开关（默认性能优先）", () => {
  it("默认关闭动画与装饰效果", () => {
    expect(DEFAULT_PREFS.motion).toBe("reduced");
    expect(DEFAULT_PREFS.effects).toBe("off");
  });

  it("合法值被保留，非法值回落默认", () => {
    expect(normalizePrefs({ motion: "full", effects: "on" })).toMatchObject({
      motion: "full",
      effects: "on",
    });
    expect(normalizePrefs({ motion: "yes", effects: 1 })).toMatchObject({
      motion: "reduced",
      effects: "off",
    });
  });

  it("旧配置文件没有这两个字段时按性能优先处理", () => {
    const p = parsePrefs(JSON.stringify({ exportFormat: "jpeg" }));
    expect(p.motion).toBe("reduced");
    expect(p.effects).toBe("off");
  });
});
