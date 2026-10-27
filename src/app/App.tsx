import { useEffect, useState } from "react";
import { getAppInfo, normalizeError, type AppInfo, type AppErrorPayload } from "../platform/ipc";

/**
 * 应用外壳。P1 阶段只验证：启动、三栏骨架、IPC 往返。
 * 真实功能面板在 T1.2 / T2.7 / T3.2 中逐个替换占位内容。
 */
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<AppErrorPayload | null>(null);

  useEffect(() => {
    getAppInfo().then(setInfo).catch((e) => setError(normalizeError(e)));
  }, []);

  return (
    <div className="workspace">
      <header className="header">
        <span className="header__title">{info?.name ?? "拼图工具"}</span>
        <span className="header__meta">
          {info ? `v${info.version}` : "正在获取版本…"}
        </span>
        <span className="header__spacer" />
        {info?.offline ? <span className="badge">本地处理 · 离线可用</span> : null}
      </header>

      <div className="body">
        <aside className="panel panel--left">
          <div className="panel__title">资源库</div>
          <div className="panel__body">尚未导入图片</div>
        </aside>

        <main className="canvas-area">
          <div className="canvas-area__placeholder">画布 2400 × 1600</div>
        </main>

        <aside className="panel panel--right">
          <div className="panel__title">属性 / 图层</div>
          <div className="panel__body">未选中对象</div>
        </aside>
      </div>

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
