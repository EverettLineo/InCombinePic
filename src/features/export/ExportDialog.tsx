import { useState } from "react";
import { overflowReport } from "../../domain/canvas";
import {
  defaultExportName,
  ensureExtension,
  heightForWidth,
  JPEG_QUALITY_MAX,
  JPEG_QUALITY_MIN,
  transparencyNote,
  validateExportSize,
  widthForHeight,
  type ExportFormat,
} from "../../domain/export";
import {
  askUser,
  normalizeError,
  openExported,
  pathExists,
  pickSavePath,
  revealExported,
} from "../../platform/ipc";
import { useDocStore } from "../../state/docStore";
import { useExportStore } from "../../state/exportStore";
import { usePrefsStore } from "../../state/prefsStore";
import { useViewStore } from "../../state/viewStore";
import { runExport } from "./exportFlow";

const FORMAT_LABEL: Record<ExportFormat, string> = { png: "PNG", jpeg: "JPEG" };

/**
 * 导出面板（T10.1）。
 *
 * 交互顺序刻意做成"先看参数再看路径"：尺寸与格式决定用户要选什么文件，
 * 反过来会让人选完路径又得回头改。
 */
export function ExportDialog() {
  const open = useViewStore((s) => s.exportOpen);
  if (!open) return null;
  return <ExportSession />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function ExportSession() {
  const doc = useDocStore((s) => s.doc);
  const close = useViewStore((s) => s.closeExport);
  const status = useExportStore((s) => s.status);
  const doneStrips = useExportStore((s) => s.doneStrips);
  const totalStrips = useExportStore((s) => s.totalStrips);
  const error = useExportStore((s) => s.error);
  const result = useExportStore((s) => s.result);
  const reset = useExportStore((s) => s.reset);
  const requestCancel = useExportStore((s) => s.requestCancel);

  // 初值来自偏好：同一台机器上用户上次选的格式不该每次重置（T11.4）
  const prefs = usePrefsStore((s) => s.prefs);
  const [format, setFormat] = useState<ExportFormat>(prefs.exportFormat);
  const [quality, setQuality] = useState(prefs.jpegQuality);
  const [width, setWidth] = useState(doc.canvas.width);
  const [height, setHeight] = useState(doc.canvas.height);
  const [lockAspect, setLockAspect] = useState(true);
  const [path, setPath] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const running = status === "running";
  const overflow = overflowReport(doc);
  const sizeError = validateExportSize(width, height);

  function switchFormat(next: ExportFormat) {
    setFormat(next);
    usePrefsStore.getState().setPrefs({ exportFormat: next });
    setPath((p) => (p ? ensureExtension(p, next) : p));
  }

  function changeQuality(v: number) {
    setQuality(v);
    usePrefsStore.getState().setPrefs({ jpegQuality: v });
  }

  function changeWidth(v: number) {
    setWidth(v);
    if (lockAspect) setHeight(heightForWidth(v, doc.canvas));
  }

  function changeHeight(v: number) {
    setHeight(v);
    if (lockAspect) setWidth(widthForHeight(v, doc.canvas));
  }

  function toggleLock(locked: boolean) {
    setLockAspect(locked);
    if (locked) setHeight(heightForWidth(width, doc.canvas));
  }

  async function choosePath(): Promise<string | null> {
    const picked = await pickSavePath(defaultExportName(format), format);
    if (!picked) return null;
    const normalized = ensureExtension(picked, format);
    setPath(normalized);
    return normalized;
  }

  async function start() {
    // 双击/回车连按会重复触发：导出是重操作，重复启动会争抢同一条导出通道
    if (running) return;
    if (sizeError) {
      setLocalError(sizeError);
      return;
    }
    setLocalError(null);

    let target = path;
    if (!target) {
      const picked = await choosePath();
      if (!picked) return;
      target = picked;
    }

    if (await pathExists(target)) {
      const ok = await askUser(
        `文件已存在：\n${target}\n\n覆盖后原文件内容将无法恢复，是否继续？`,
        "覆盖",
        "取消",
      );
      if (!ok) return;
    }

    await runExport({ format, width, height, quality, path: target });
  }

  async function openResult(kind: "file" | "folder") {
    if (!result) return;
    try {
      if (kind === "file") await openExported(result.path);
      else await revealExported(result.path);
    } catch (e) {
      setLocalError(normalizeError(e).message);
    }
  }

  function finishAndClose() {
    reset();
    close();
  }

  const progress = totalStrips > 0 ? Math.round((doneStrips / totalStrips) * 100) : 0;

  return (
    <div className="crop-overlay" onPointerDown={running ? undefined : finishAndClose}>
      <div className="export-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="crop-dialog__head">
          <span className="crop-dialog__title">导出拼图</span>
          <span className="crop-dialog__meta">
            画布 {doc.canvas.width} × {doc.canvas.height}
          </span>
          <span className="crop-dialog__spacer" />
          <button onClick={finishAndClose} disabled={running}>
            关闭
          </button>
        </div>

        <div className="export-body">
          <div className="export-row">
            <span className="export-row__label">格式</span>
            <div className="export-formats">
              {(["png", "jpeg"] as ExportFormat[]).map((f) => (
                <button
                  key={f}
                  className={`btn-quiet${format === f ? " export-formats__active" : ""}`}
                  onClick={() => switchFormat(f)}
                  disabled={running}
                >
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          {format === "jpeg" ? (
            <div className="export-row">
              <span className="export-row__label">质量</span>
              <input
                type="range"
                min={JPEG_QUALITY_MIN}
                max={JPEG_QUALITY_MAX}
                step={1}
                value={quality}
                onChange={(e) => changeQuality(Number(e.target.value))}
                disabled={running}
                aria-label="JPEG 质量"
              />
              <span className="inspector__value">{quality}</span>
            </div>
          ) : (
            <div className="export-row">
              <span className="export-row__label">质量</span>
              <span className="export-row__hint">PNG 为无损输出，无质量选项</span>
            </div>
          )}

          <div className="export-row">
            <span className="export-row__label">尺寸</span>
            <input
              className="export-size"
              type="number"
              min={1}
              value={width}
              onChange={(e) => changeWidth(Number(e.target.value))}
              disabled={running}
              aria-label="导出宽度"
            />
            <span className="export-row__hint">×</span>
            <input
              className="export-size"
              type="number"
              min={1}
              value={height}
              onChange={(e) => changeHeight(Number(e.target.value))}
              disabled={running}
              aria-label="导出高度"
            />
            <label className="export-lock">
              <input
                type="checkbox"
                checked={lockAspect}
                onChange={(e) => toggleLock(e.target.checked)}
                disabled={running}
              />
              保持宽高比
            </label>
          </div>

          <div className="export-row">
            <span className="export-row__label">保存到</span>
            <input
              className="export-path"
              type="text"
              value={path}
              placeholder="点击右侧按钮选择保存位置"
              readOnly
              title={path}
            />
            <button onClick={() => void choosePath()} disabled={running}>
              选择…
            </button>
          </div>

          <div className={`export-note${sizeError ? " export-note--error" : ""}`}>
            {sizeError ?? transparencyNote(format, doc.canvas.background.type)}
          </div>

          {overflow.count > 0 ? (
            <div className="export-note export-note--warn">
              有 {overflow.count} 张图片超出画布，超出的部分不会出现在导出结果中（画布不会自动扩大）。
            </div>
          ) : null}

          {status === "running" ? (
            <div className="export-progress">
              <div className="export-progress__bar">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="export-progress__text">
                正在导出 第 {doneStrips} / {totalStrips} 条 · {progress}%
              </div>
            </div>
          ) : null}

          {status === "error" && error ? (
            <div className="export-note export-note--error">
              <strong>{error.message}</strong>
              {error.hint ? <div>{error.hint}</div> : null}
              <div>编辑内容未受影响，可直接重试。</div>
            </div>
          ) : null}

          {status === "done" && result ? (
            <div className="export-note export-note--ok">
              已导出 {result.width} × {result.height} · {formatBytes(result.bytes)}
              <div className="export-result-path" title={result.path}>
                {result.path}
              </div>
            </div>
          ) : null}

          {localError ? <div className="export-note export-note--error">{localError}</div> : null}
        </div>

        <div className="crop-dialog__foot">
          <span className="crop-dialog__hint">
            导出不修改源文件，也不保留源图元数据
          </span>
          <span className="crop-dialog__spacer" />
          {status === "running" ? (
            <button onClick={requestCancel}>取消导出</button>
          ) : status === "done" && result ? (
            <>
              <button onClick={() => void openResult("folder")}>打开所在文件夹</button>
              <button className="btn-primary" onClick={() => void openResult("file")}>
                打开文件
              </button>
            </>
          ) : (
            <>
              <button onClick={finishAndClose}>取消</button>
              <button
                className="btn-primary"
                onClick={() => void start()}
                disabled={!!sizeError || running}
              >
                {status === "error" ? "重试导出" : "导出"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
