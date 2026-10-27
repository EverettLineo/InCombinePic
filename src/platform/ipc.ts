/**
 * IPC 唯一出口。所有 Rust 调用集中在此（docs/ARCHITECTURE.md §1 规则 3）。
 * 其他层不得直接 import @tauri-apps/api，该约束由 eslint 强制。
 */

import { invoke } from "@tauri-apps/api/core";

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
