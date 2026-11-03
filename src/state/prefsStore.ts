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
  /**
   * 界面动效：`reduced` 性能优先（默认，关闭所有非必要动画与过渡），`full` 流畅。
   * 默认关不是审美判断，而是把"老旧政务机上也要跟手"放在第一位。
   */
  motion: MotionMode;
  /** 装饰性阴影与半透明背景。关掉可减少合成开销，远程桌面/集显更明显 */
  effects: EffectsMode;
}

export type MotionMode = "reduced" | "full";
export type EffectsMode = "off" | "on";

export const DEFAULT_PREFS: Prefs = {
  exportFormat: "png",
  jpegQuality: 92,
  canvasWidth: 2400,
  canvasHeight: 1600,
  librarySort: "custom",
  rightTab: "props",
  motion: "reduced",
  effects: "off",
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
    motion: o.motion === "full" ? "full" : "reduced",
    effects: o.effects === "on" ? "on" : "off",
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
  /** 恢复全部默认值（含画布尺寸与排序方式，会改动当前文档设置） */
  resetToDefaults: () => void;
}

export const usePrefsStore = create<PrefsStore>((set) => ({
  prefs: { ...DEFAULT_PREFS },
  setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
  resetToDefaults: () => {
    const next: Prefs = { ...DEFAULT_PREFS };
    set({ prefs: next });
    // 尺寸/排序/标签页要真的生效，不只是改数字
    applyPrefs(next);
  },
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
  applyAppearance(p);
}

/**
 * 把观感偏好落到根节点，CSS 用 `[data-motion="full"]` 决定是否启用过渡。
 *
 * 用属性选择器而不是逐个组件传 prop：动画开关要影响整棵树，
 * 传 prop 会污染所有组件的接口，而 `data-*` 只影响样式。
 */
export function applyAppearance(p: Pick<Prefs, "motion" | "effects">): void {
  const root = document.documentElement;
  root.dataset.motion = p.motion;
  root.dataset.effects = p.effects;
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
    if (s.prefs !== prev.prefs) {
      // 观感开关即时生效：不等落盘，避免用户改了看不到变化
      applyAppearance(s.prefs);
      scheduleSave(s.prefs);
    }
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
