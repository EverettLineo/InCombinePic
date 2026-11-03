/**
 * 导出流程编排（T10.2 / T10.8）。
 *
 * 一次导出 = 逐条带渲染 → 交给 Rust 拼接编码 → 落盘。
 * 每渲染完一条才请求下一条，因此界面始终保持可交互，进度也真实。
 */

import { planStrips, type ExportFormat } from "../../domain/export";
import {
  exportAbort,
  exportBegin,
  exportFinish,
  exportWriteStrip,
  normalizeError,
} from "../../platform/ipc";
import { useDocStore } from "../../state/docStore";
import { useExportStore } from "../../state/exportStore";
import { useLibraryStore } from "../../state/libraryStore";
import { loadExportSources } from "../canvas/sourceCache";
import { renderStripBase64 } from "./renderStrips";

export interface ExportRequest {
  format: ExportFormat;
  width: number;
  height: number;
  quality: number;
  path: string;
}

/**
 * 执行导出。调用方负责尺寸校验、路径选择与覆盖确认。
 * 任何失败都会还原导出状态并保留编辑内容（基线 §12.5）。
 */
export async function runExport(req: ExportRequest): Promise<void> {
  const store = useExportStore.getState();
  // 防御性检查：调用方（面板按钮）已禁用，但快捷键/脚本仍可能重复触发。
  // 两次导出会同时占用 Rust 侧的单一 job，结果是两边都失败。
  if (useExportStore.getState().status === "running") return;

  const doc = useDocStore.getState().doc;
  const items = useLibraryStore.getState().items;
  const revisionAtStart = useDocStore.getState().revision;

  const strips = planStrips(req.height);
  if (strips.length === 0) {
    store.fail({ code: "INTERNAL", message: "导出尺寸无效", hint: "请检查宽高设置" });
    return;
  }
  store.begin(strips.length);

  let prep: Awaited<ReturnType<typeof loadExportSources>> | null = null;
  try {
    // 导出源与预览源不同：走同源 blob（避免 canvas 污染），分辨率按输出尺寸算
    prep = await loadExportSources(doc, items, req.width, req.height);
    if (prep.failed.length > 0) {
      throw new Error(`有 ${prep.failed.length} 张图片无法读取，已取消导出`);
    }
    const sources = prep.sources;

    const bgType = doc.canvas.background.type;
    const skipBackground = req.format === "png" && bgType === "transparent";
    const forceWhite = req.format !== "png" && bgType === "transparent";

    await exportBegin(req.width, req.height, req.format, req.quality);

    for (const strip of strips) {
      if (useExportStore.getState().cancelRequested) {
        await exportAbort().catch(() => undefined);
        useExportStore.setState({ status: "idle", doneStrips: 0, totalStrips: 0 });
        return;
      }

      const base64 = await renderStripBase64({
        doc,
        sources,
        outWidth: req.width,
        outHeight: req.height,
        rowStart: strip.rowStart,
        renderRows: strip.renderRows,
        skipBackground,
        forceWhite,
      });
      await exportWriteStrip(strip.rowStart, strip.rows, base64);
      useExportStore.getState().setProgress(strip.index + 1);
    }

    const result = await exportFinish(req.path);
    useExportStore.getState().succeed(result);

    // 导出成功且期间没有新的编辑，才清除"未导出修改"（D-05 口径）
    if (useDocStore.getState().revision === revisionAtStart) {
      useDocStore.getState().markExported();
    }
  } catch (e) {
    await exportAbort().catch(() => undefined);
    useExportStore.getState().fail(normalizeError(e));
  } finally {
    // 导出用的原图位图动辄几十 MB，用完必须放掉
    prep?.release();
  }
}
