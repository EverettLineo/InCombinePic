import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, normalizePrefs, parsePrefs } from "./prefsStore";

describe("normalizePrefs（T11.4 的白名单）", () => {
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
    const p = normalizePrefs({ exportFormat: "gif", librarySort: "magic", leftTab: "x", rightTab: 1 });
    expect(p.exportFormat).toBe("png");
    expect(p.librarySort).toBe("custom");
    expect(p.leftTab).toBe("library");
    expect(p.rightTab).toBe("props");
  });

  it("合法枚举值被保留", () => {
    const p = normalizePrefs({
      exportFormat: "jpeg",
      librarySort: "name",
      leftTab: "templates",
      rightTab: "layers",
    });
    expect(p.exportFormat).toBe("jpeg");
    expect(p.librarySort).toBe("name");
    expect(p.leftTab).toBe("templates");
    expect(p.rightTab).toBe("layers");
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

  it("偏好里混入文档内容也不会被采纳（T11.5 的护栏）", () => {
    const p = parsePrefs(JSON.stringify({ canvasWidth: 3000, instances: [{ id: "a" }] }));
    expect(p.canvasWidth).toBe(3000);
    expect("instances" in p).toBe(false);
  });
});
