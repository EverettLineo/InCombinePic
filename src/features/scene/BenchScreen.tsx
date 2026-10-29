import { useEffect, useRef } from "react";
import { saveBenchAndQuit } from "../../platform/ipc";
import { runCanvasBench } from "./bench";

/**
 * 基准模式界面（T3.7）。
 * 由环境变量 PINTU_BENCH=1 触发，正常运行不会进入此分支。
 */
export function BenchScreen() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    void (async () => {
      try {
        // 等一帧确保容器已完成布局，拿到真实视口尺寸
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const metrics = await runCanvasBench(host);
        if (!alive) return;
        await saveBenchAndQuit(JSON.stringify(metrics, null, 2));
      } catch (e) {
        // 基准失败也要落盘，否则只剩一个空白窗口，无法判断卡在哪
        if (!alive) return;
        await saveBenchAndQuit(
          JSON.stringify(
            { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : null },
            null,
            2,
          ),
        ).catch(() => undefined);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="workspace">
      <header className="header">
        <span className="header__title">画布渲染基准</span>
        <span className="header__meta">50 实例 · 同步光栅化计时 · 完成后自动退出</span>
      </header>
      <div className="stage-host" ref={hostRef} />
    </div>
  );
}
