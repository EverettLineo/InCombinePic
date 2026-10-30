/**
 * 离线可用性守卫（T12.5）。
 *
 * 基线要求「全程无网络请求」。靠人工抓包只能证明某一刻没发请求，
 * 挡不住以后某次改动悄悄引入一个 CDN 字体或一个统计脚本。
 *
 * 所以这里把它做成可执行断言：源码里不允许出现任何网络 API，
 * 依赖里不允许出现统计 SDK，配置里不允许出现 updater。
 * 这是一条**会在测试里失败的规则**，不是文档里的承诺。
 *
 * 实现上刻意不用 `node:fs`：用打包器的 `?raw` 读源码。
 * 好处是应用工程里连 `process` / `fs` 这类 Node 全局都不可见，
 * 顺带保证了"前端代码不可能误用文件系统"。
 */
import { describe, expect, it } from "vitest";
import tauriConf from "../../src-tauri/tauri.conf.json";
import pkg from "../../package.json";

/** 所有源码原文，键为相对路径 */
const SOURCES = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Cargo.toml 原文（只此一份，用于检查 Rust 依赖） */
const CARGO = import.meta.glob("../../src-tauri/Cargo.toml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** 明确禁止的网络 API：出现即视为破坏离线约束 */
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bfetch\s*\(/, why: "fetch 会发起网络请求；本地文件请走 asset 协议" },
  { pattern: /XMLHttpRequest/, why: "同 fetch，且更难审查" },
  { pattern: /new\s+WebSocket\s*\(/, why: "WebSocket 需要服务端，本应用没有" },
  { pattern: /new\s+EventSource\s*\(/, why: "SSE 需要服务端" },
  { pattern: /sendBeacon/, why: "常用于埋点上报" },
  { pattern: /from\s+["'](axios|got|node-fetch|ky)["']/, why: "网络库不在离线应用的依赖范围内" },
];

/** 统计/监控 SDK 一律不允许：本应用明确无遥测 */
const TELEMETRY_PACKAGES = [
  "sentry",
  "posthog",
  "mixpanel",
  "amplitude",
  "google-analytics",
  "gtag",
  "umami",
  "plausible",
  "bugsnag",
  "datadog",
];

describe("源码不含网络 API", () => {
  it("src 下所有非测试源码都不使用网络能力", () => {
    const entries = Object.entries(SOURCES).filter(([path]) => !/\.test\.tsx?$/.test(path));
    // 少于 40 个文件说明 glob 没匹配上，宁可让检查失败也不要空跑通过
    expect(entries.length).toBeGreaterThan(40);

    const violations: string[] = [];
    for (const [path, text] of entries) {
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(text)) {
          violations.push(`${path.replace("../", "src/")} → ${rule.why}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("依赖不含遥测 SDK", () => {
  it("package.json 的运行时依赖里没有统计/监控包", () => {
    const names = Object.keys(pkg.dependencies ?? {}).map((n) => n.toLowerCase());
    const hits = names.filter((n) => TELEMETRY_PACKAGES.some((t) => n.includes(t)));
    expect(hits).toEqual([]);
  });

  it("Rust 侧依赖同样没有遥测与更新器", () => {
    const raw = Object.values(CARGO)[0] ?? "";
    // 只检查 [dependencies] 段，避免误伤注释里的历史说明
    const depSection = raw.split("[dependencies]")[1]?.split("\n[")[0] ?? "";
    expect(depSection.length).toBeGreaterThan(0);
    for (const banned of ["tauri-plugin-updater", "sentry", "reqwest", "hyper"]) {
      expect(depSection.includes(banned), `不应依赖 ${banned}`).toBe(false);
    }
  });
});

describe("Tauri 配置不启用联网能力", () => {
  it("没有启用 updater（自动更新必然联网）", () => {
    expect(JSON.stringify(tauriConf)).not.toContain("updater");
  });

  it("asset 协议已启用：本地图片靠它加载，而不是起一个 http 服务", () => {
    expect(tauriConf.app?.security?.assetProtocol?.enable).toBe(true);
  });
});
