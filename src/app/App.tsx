import { useEffect, useState } from "react";
import { CanvasArea } from "../features/canvas/CanvasArea";
import { CropEditor } from "../features/crop/CropEditor";
import { ExportDialog } from "../features/export/ExportDialog";
import { ImagePicker } from "../features/templates/ImagePicker";
import { BenchScreen } from "../features/scene/BenchScreen";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";
import {
  getAppInfo,
  isBenchRequested,
  normalizeError,
  type AppErrorPayload,
  type AppInfo,
} from "../platform/ipc";
import { useDocStore } from "../state/docStore";
import { initPrefs } from "../state/prefsStore";
import { useViewStore } from "../state/viewStore";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { useAppShortcuts } from "./useAppShortcuts";
import { useCloseGuard } from "./useCloseGuard";
import { nextUndoLabel } from "../domain/history";

/** 应用外壳：三栏工作区（左资源 / 中画布 / 右属性），遵循基线 §5.2 */
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<AppErrorPayload | null>(null);
  /** null = 尚未判定，避免基准模式未判定时就渲染主界面又切走 */
  const [bench, setBench] = useState<boolean | null>(null);
  /** 偏好加载完成后才渲染主界面，避免先闪一帧默认画布尺寸再跳变 */
  const [prefsReady, setPrefsReady] = useState(false);

  const dirty = useDocStore((s) => s.dirty);
  const past = useDocStore((s) => s.past);
  const future = useDocStore((s) => s.future);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);

  useAppShortcuts();
  useCloseGuard();

  useEffect(() => {
    getAppInfo()
      .then(setInfo)
      .catch((e) => setError(normalizeError(e)));
    isBenchRequested()
      .then(setBench)
      .catch(() => setBench(false));
    void initPrefs()
      .catch(() => undefined)
      .finally(() => setPrefsReady(true));
  }, []);

  if (bench === null) return null;
  if (bench) return <BenchScreen />;
  if (!prefsReady) return null;

  const undoLabel = nextUndoLabel({ past, future });

  return (
    <div className="workspace">
      <header className="header">
        <span className="header__title">{info?.name ?? "拼图工具"}</span>
        <span className="header__meta">{info ? `v${info.version}` : "正在获取版本…"}</span>

        <span className="header__divider" />
        <button
          className="btn-icon"
          onClick={undo}
          disabled={past.length === 0}
          title={undoLabel ? `撤销：${undoLabel}（Ctrl+Z）` : "无可撤销操作"}
        >
          ↶
        </button>
        <button
          className="btn-icon"
          onClick={redo}
          disabled={future.length === 0}
          title={future.length > 0 ? "重做（Ctrl+Y）" : "无可重做操作"}
        >
          ↷
        </button>

        {dirty ? <span className="header__meta">· 有未导出修改</span> : null}
        <span className="header__spacer" />
        {info?.offline ? <span className="badge">本地处理 · 离线可用</span> : null}
        <button
          className="btn-primary header__export"
          onClick={() => useViewStore.getState().openExport()}
          title="导出为 PNG / JPEG"
        >
          导出
        </button>
      </header>

      <div className="body">
        <LeftPanel />

        <ErrorBoundary areaName="画布">
          <CanvasArea />
        </ErrorBoundary>

        <RightPanel />
      </div>

      <CropEditor />
      <ImagePicker />
      <ExportDialog />

      {error ? (
        <div className="error-box">
          <div>{error.message}</div>
          {error.hint ? <div>{error.hint}</div> : null}
          <div>错误码：{error.code}</div>
        </div>
      ) : null}
    </div>
  );
}
