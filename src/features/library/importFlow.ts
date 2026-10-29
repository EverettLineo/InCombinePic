/**
 * 导入流程编排（基线 §6.2 / §6.3 / §6.4）。
 *
 * 三条不可退让的规则：
 * 1. 单文件失败不拖垮整批 —— 其余文件照常入库，最后汇总失败原因；
 * 2. 同路径才判重，不比较内容哈希（基线 §6.4 明确排除）；
 * 3. 大图不静默导入 —— 先预警，由用户决定是否继续。
 */

import {
  askUser,
  pickImageFiles,
  probeFiles,
  type ProbeOutcome,
} from "../../platform/ipc";
import { useLibraryStore } from "../../state/libraryStore";
import type { LibraryItem } from "../../domain/types";

export interface ImportFailure {
  path: string;
  fileName: string;
  code: string;
  message: string;
  hint?: string | null;
}

export interface ImportReport {
  /** 本次实际入库数量 */
  addedCount: number;
  /** 因"已在资源库"被跳过的数量 */
  skippedDuplicateCount: number;
  /** 失败明细（每个文件一条，附原因） */
  failures: ImportFailure[];
  /** 用户取消（大图预警时选择取消） */
  cancelled: boolean;
  /** 用户选中但最终未入库的总数 */
  totalSelected: number;
}

export function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/** Windows 路径大小写不敏感、分隔符可混用，判重前统一规范化 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

function toFailure(o: ProbeOutcome): ImportFailure {
  return {
    path: o.path,
    fileName: baseName(o.path),
    code: o.error?.code ?? "INTERNAL",
    message: o.error?.message ?? "无法导入",
    hint: o.error?.hint ?? null,
  };
}

export async function importImages(): Promise<ImportReport | null> {
  const selected = await pickImageFiles();
  if (selected.length === 0) return null;

  const store = useLibraryStore.getState();
  const existing = new Set(store.items.map((i) => normalizePath(i.sourcePath)));
  const duplicates = selected.filter((p) => existing.has(normalizePath(p)));

  let paths = selected;
  let skippedDuplicateCount = 0;
  let addAsNew = true;

  if (duplicates.length > 0) {
    // 基线 §6.4：询问跳过或再次添加。按整批询问，避免逐个弹窗打断操作。
    addAsNew = await askUser(
      `有 ${duplicates.length} 个文件已在资源库中（同一来源路径）。\n\n选择"再次添加"会为它们各创建独立条目；选择"跳过"则只导入新文件。`,
      "再次添加",
      "跳过这些文件",
    );
    if (!addAsNew) {
      paths = selected.filter((p) => !existing.has(normalizePath(p)));
      skippedDuplicateCount = duplicates.length;
    }
  }

  if (paths.length === 0) {
    return {
      addedCount: 0,
      skippedDuplicateCount,
      failures: [],
      cancelled: false,
      totalSelected: selected.length,
    };
  }

  const outcomes = await probeFiles(paths);
  const okOutcomes = outcomes.filter((o) => o.ok && o.meta);
  const failures = outcomes.filter((o) => !o.ok).map(toFailure);

  // 大图 / 大总量预警：给出可执行的数字，让用户自己判断（基线 §6.3）
  // 单张阈值由 Rust 判定（meta.risky），前端只做汇总，避免两处阈值不同步。
  const totalMb = okOutcomes.reduce((sum, o) => sum + (o.meta?.estimatedRgbaMb ?? 0), 0);
  const risky = okOutcomes.filter((o) => o.meta?.risky);

  if (risky.length > 0 || totalMb > 512) {
    const proceed = await askUser(
      `本次导入的图片解码后约需 ${Math.round(totalMb)} MB 内存` +
        (risky.length > 0 ? `，其中 ${risky.length} 张单张占用偏大` : "") +
        `。\n\n继续导入可能使界面变慢，是否继续？`,
      "继续导入",
      "取消导入",
    );
    if (!proceed) {
      return {
        addedCount: 0,
        skippedDuplicateCount,
        failures,
        cancelled: true,
        totalSelected: selected.length,
      };
    }
  }

  const baseSeq = store.nextImportSeq();
  const now = Date.now();
  const newItems: LibraryItem[] = okOutcomes.map((o, idx) => ({
    id: `lib_${(baseSeq + idx).toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    sourcePath: o.path,
    fileName: baseName(o.path),
    importSeq: baseSeq + idx,
    importedAt: now + idx,
    width: o.meta!.width,
    height: o.meta!.height,
    format: o.meta!.format,
    hasAlpha: o.meta!.hasAlpha,
    fileSize: o.meta!.fileSize,
  }));

  if (newItems.length > 0) useLibraryStore.getState().addItems(newItems);

  return {
    addedCount: newItems.length,
    skippedDuplicateCount,
    failures,
    cancelled: false,
    totalSelected: selected.length,
  };
}
