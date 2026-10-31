/**
 * 偏好持久化（T11.4）。
 *
 * 白名单原则：这里**只**存界面偏好，绝不存文档内容——
 * 启动必须是空画布 + 空资源库（T11.5），否则用户会以为上次的图"丢了"。
 *
 * 读取时一律走 `normalizePrefs`：配置文件是磁盘上的普通 JSON，
 * 用户手改、版本回退、写到一半断电都可能出现非法值，不能让启动直接崩。
 */

import { create } from "zustand";
import { LIBRARY_SORT_MODES, type LibrarySortMode } from "../domain/library";
import type { ExportFormat } from "../domain/export";
import { setCanvasSize } from "../domain/document";
import { loadPrefsJson, savePrefsJson } from "../platform/ipc";
import { useDocStore } from "./docStore";
import { useLibraryStore } from "./libraryStore";
import { useViewStore, type RightTab } from "./viewStore";

export interface Prefs {
  /** 导出面板上次使用的格式 */
  exportFormat: ExportFormat;
  jpegQuality: number;
  /** 新建画布的默认尺寸 */
  canvasWidth: number;
  canvasHeight: number;
  librarySort: LibrarySortMode;
  rightTab: RightTab;
}

export const DEFAULT_PREFS: Prefs = {
  exportFormat: "png",
  jpegQuality: 92,
  canvasWidth: 2400,
  canvasHeight: 1600,
  librarySort: "custom",
  rightTab: "props",
};

const RIGHT_TABS: RightTab[] = ["props", "layers", "canvas", "templates"];

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? Math.round(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 把任意磁盘内容规整为合法偏好：逐字段白名单，非法即回落默认值 */
export function normalizePrefs(raw: unknown): Prefs {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_PREFS };
  const o = raw as Record<string, unknown>;

  return {
    exportFormat: o.exportFormat === "jpeg" ? "jpeg" : "png",
    jpegQuality: clampInt(o.jpegQuality, 60, 100, DEFAULT_PREFS.jpegQuality),
    canvasWidth: clampInt(o.canvasWidth, 64, 20000, DEFAULT_PREFS.canvasWidth),
    canvasHeight: clampInt(o.canvasHeight, 64, 20000, DEFAULT_PREFS.canvasHeight),
    librarySort: (LIBRARY_SORT_MODES as readonly string[]).includes(o.librarySort as string)
      ? (o.librarySort as LibrarySortMode)
      : DEFAULT_PREFS.librarySort,
    rightTab: RIGHT_TABS.includes(o.rightTab as RightTab)
      ? (o.rightTab as RightTab)
      : DEFAULT_PREFS.rightTab,
  };
}

/** 从磁盘文本解析：解析失败一律回默认值，不抛异常打断启动 */
export function parsePrefs(text: string | null): Prefs {
  if (!text) return { ...DEFAULT_PREFS };
  try {
    return normalizePrefs(JSON.parse(text));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export interface PrefsStore {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
}

export const usePrefsStore = create<PrefsStore>((set) => ({
  prefs: { ...DEFAULT_PREFS },
  setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
}));

const SAVE_DEBOUNCE_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = "";

function scheduleSave(prefs: Prefs): void {
  const json = JSON.stringify(prefs);
  if (json === lastSaved) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    lastSaved = json;
    void savePrefsJson(json).catch(() => {
      // 偏好保存失败不打断使用：下次改动会再试
    });
  }, SAVE_DEBOUNCE_MS);
}

/** 把偏好应用到各 store（启动时调用一次） */
function applyPrefs(p: Prefs): void {
  const docStore = useDocStore.getState();
  const canvas = docStore.doc.canvas;
  if (canvas.width !== p.canvasWidth || canvas.height !== p.canvasHeight) {
    // 启动时应用默认尺寸，不进撤销历史（此时还没有任何编辑）
    docStore.commitNoHistory((d) => setCanvasSize(d, p.canvasWidth, p.canvasHeight));
    docStore.markExported();
  }
  useLibraryStore.getState().setSortMode(p.librarySort);
  useViewStore.setState({ rightTab: p.rightTab });
}

/** 启动时加载偏好；返回最终生效的偏好 */
export async function initPrefs(): Promise<Prefs> {
  let text: string | null = null;
  try {
    text = await loadPrefsJson();
  } catch {
    text = null;
  }
  const prefs = parsePrefs(text);
  usePrefsStore.setState({ prefs });
  applyPrefs(prefs);
  lastSaved = JSON.stringify(prefs);

  // 首次启动就把默认值落盘：配置文件可被用户直接查看与备份，
  // 也避免"改了设置却没生效"时无法判断是没保存还是路径不对。
  if (text === null) {
    void savePrefsJson(lastSaved).catch(() => undefined);
  }

  // 之后的变化按需回写（debounce），避免每次拖动滑块都落盘
  usePrefsStore.subscribe((s, prev) => {
    if (s.prefs !== prev.prefs) scheduleSave(s.prefs);
  });

  // 面板标签与排序模式由各自 store 驱动，这里把变化同步进偏好
  useViewStore.subscribe((s, prev) => {
    if (s.rightTab !== prev.rightTab) {
      usePrefsStore.getState().setPrefs({ rightTab: s.rightTab });
    }
  });
  useLibraryStore.subscribe((s, prev) => {
    if (s.sortMode !== prev.sortMode) {
      usePrefsStore.getState().setPrefs({ librarySort: s.sortMode });
    }
  });
  useDocStore.subscribe((s, prev) => {
    const a = s.doc.canvas;
    const b = prev.doc.canvas;
    if (a.width !== b.width || a.height !== b.height) {
      usePrefsStore.getState().setPrefs({ canvasWidth: a.width, canvasHeight: a.height });
    }
  });

  return prefs;
}
