/**
 * IPC 唯一出口。所有 Rust 调用集中在此（docs/ARCHITECTURE.md §1 规则 3）。
 * 其他层不得直接 import @tauri-apps/*，该约束由 eslint 强制。
 */

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { ExportFormat } from "../domain/export";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, open, save } from "@tauri-apps/plugin-dialog";

/** 与 src-tauri/src/error.rs 的 ErrorCode 保持一致 */
export type ErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "DECODE_FAILED"
  | "OUT_OF_MEMORY"
  | "IO_FAILED"
  | "WRITE_DENIED"
  | "INTERNAL";

/** Rust 侧统一错误结构 */
export interface AppErrorPayload {
  code: ErrorCode;
  message: string;
  hint?: string | null;
}

/**
 * 把 invoke 抛出的任意错误规整为可展示结构。
 * 前端不得自己拼接错误文案，一律使用 Rust 返回的 message。
 */
export function normalizeError(e: unknown): AppErrorPayload {
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const p = e as AppErrorPayload;
    return { code: p.code, message: p.message, hint: p.hint ?? null };
  }
  return {
    code: "INTERNAL",
    message: typeof e === "string" ? e : "发生未知错误",
    hint: "如反复出现，请重启应用后重试",
  };
}

export interface AppInfo {
  name: string;
  version: string;
  offline: boolean;
}

export async function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

// ---------- 图片导入 ----------

export interface ImageMeta {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp" | "bmp";
  hasAlpha: boolean;
  fileSize: number;
  exifOrientation: number;
  /** 解码后 RGBA 估算占用（MB），用于导入风险预警 */
  estimatedRgbaMb: number;
  /** 是否超过单张风险阈值（判定在 Rust 侧，前端不重复定义阈值） */
  risky: boolean;
}

export interface ProbeOutcome {
  path: string;
  ok: boolean;
  meta?: ImageMeta | null;
  error?: AppErrorPayload | null;
}

/**
 * 打开系统文件选择器。
 * 故意把 heic/heif 纳入可选范围：让用户能选中并得到明确提示，
 * 而不是在文件列表里根本看不到（基线 §6.1 要求"明确提示不支持"）。
 */
export async function pickImageFiles(): Promise<string[]> {
  const result = await open({
    multiple: true,
    directory: false,
    title: "选择要导入的图片",
    filters: [
      {
        name: "图片",
        extensions: ["png", "jpg", "jpeg", "webp", "bmp", "heic", "heif"],
      },
    ],
  });
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}

/** 批量探测。Rust 侧保证单文件失败不影响其他文件 */
export async function probeFiles(paths: string[]): Promise<ProbeOutcome[]> {
  return invoke<ProbeOutcome[]>("probe_files", { paths });
}

/** 原生询问对话框（比 window.confirm 可靠，且与系统风格一致） */
export async function askUser(
  message: string,
  okLabel: string,
  cancelLabel: string,
): Promise<boolean> {
  return ask(message, {
    title: "拼图工具",
    kind: "warning",
    okLabel,
    cancelLabel,
  });
}

// ---------- 缩略图 ----------

export interface ThumbnailResult {
  path: string;
  width: number;
  height: number;
}

/** 请求（或复用缓存）显示用缩略图 */
export async function prepareThumbnail(path: string, maxEdge: number): Promise<ThumbnailResult> {
  return invoke<ThumbnailResult>("prepare_thumbnail", { path, maxEdge });
}

/**
 * 本地文件路径 → 可在 WebView 中加载的 asset URL。
 * 依赖 tauri.conf.json 的 app.security.assetProtocol（scope 限定为 $APPCACHE/**），
 * 仅缓存目录可被加载，用户原始目录不在 scope 内。
 */
export function toAssetUrl(filePath: string): string {
  return convertFileSrc(filePath);
}

// ---------- 拖放与剪贴板导入 ----------

/**
 * 监听来自操作系统的文件拖放。
 *
 * 这是 WebView 层面的 OS 级拖放，与页面内 HTML5 拖拽（画布内拖图、列表内排序）互不干扰。
 * 返回取消监听的函数。
 */
export async function onFileDrop(
  handler: (paths: string[]) => void,
): Promise<() => void> {
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") {
      const paths = event.payload.paths ?? [];
      if (paths.length > 0) handler(paths);
    }
  });
  return unlisten;
}

/** 读取剪贴板图片并落成临时文件；剪贴板中没有图片时返回 null */
export async function readClipboardImage(): Promise<string | null> {
  const r = await invoke<{ path: string } | null>("read_clipboard_image");
  return r?.path ?? null;
}

// ---------- 渲染基准（仅 PINTU_BENCH=1 时启用） ----------

export async function isBenchRequested(): Promise<boolean> {
  return invoke<boolean>("bench_requested");
}

export async function saveBenchAndQuit(json: string): Promise<string> {
  return invoke<string>("save_bench_and_quit", { json });
}

// ---------- 导出（T10） ----------

export interface ExportFinishResult {
  path: string;
  bytes: number;
  width: number;
  height: number;
}

export async function exportBegin(
  width: number,
  height: number,
  format: ExportFormat,
  quality: number,
): Promise<void> {
  await invoke("export_begin", { width, height, format, quality });
}

/** 发送一条条带：base64 编码的 PNG（不含 data: 前缀） */
export async function exportWriteStrip(
  rowStart: number,
  rows: number,
  pngBase64: string,
): Promise<void> {
  await invoke("export_write_strip", { rowStart, rows, pngBase64 });
}

export async function exportFinish(path: string): Promise<ExportFinishResult> {
  return invoke<ExportFinishResult>("export_finish", { path });
}

export async function exportAbort(): Promise<void> {
  await invoke("export_abort");
}

export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

export async function openExported(path: string): Promise<void> {
  await invoke("open_exported", { path });
}

export async function revealExported(path: string): Promise<void> {
  await invoke("reveal_exported", { path });
}

/** 保存对话框：返回用户选定的路径，取消则返回 null */
export async function pickSavePath(
  defaultName: string,
  format: ExportFormat,
): Promise<string | null> {
  const ext = format === "png" ? "png" : "jpg";
  const result = await save({
    title: "导出拼图",
    defaultPath: defaultName,
    filters: [
      {
        name: format === "png" ? "PNG 图片" : "JPEG 图片",
        extensions: [ext],
      },
    ],
  });
  return result ?? null;
}
