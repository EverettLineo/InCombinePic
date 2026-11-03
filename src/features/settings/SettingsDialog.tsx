import { usePrefsStore } from "../../state/prefsStore";
import { useViewStore } from "../../state/viewStore";

/**
 * 设置面板。
 *
 * 目前只有观感/性能两类开关，但独立成面板而不是塞进「关于」：
 * 关于是"看信息"的地方，设置是"改行为"的地方，混在一起用户找不到。
 *
 * 所有开关都即时生效并落盘（prefsStore 内部 400ms 防抖），没有"确定/取消"——
 * 用户能立刻看到变化，比先确认再应用更直接。
 */
export function SettingsDialog() {
  const open = useViewStore((s) => s.settingsOpen);
  const close = useViewStore((s) => s.closeSettings);

  const prefs = usePrefsStore((s) => s.prefs);
  const setPrefs = usePrefsStore((s) => s.setPrefs);
  const reset = usePrefsStore((s) => s.resetToDefaults);

  if (!open) return null;

  return (
    <div className="crop-overlay" onPointerDown={close}>
      <div className="settings-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="crop-dialog__head">
          <span className="crop-dialog__title">设置</span>
          <span className="crop-dialog__meta">改动立即生效</span>
          <span className="crop-dialog__spacer" />
          <button onClick={close}>关闭</button>
        </div>

        <div className="settings-body">
          <section className="settings-group">
            <h3 className="settings-group__title">外观与性能</h3>

            <label className="settings-row">
              <span className="settings-row__text">
                <span className="settings-row__name">交互动画</span>
                <span className="settings-row__desc">
                  按钮反馈、弹窗入场、面板切换的过渡。关闭后界面立即响应，不做补间
                </span>
              </span>
              <input
                type="checkbox"
                className="settings-switch"
                checked={prefs.motion === "full"}
                onChange={(e) => setPrefs({ motion: e.target.checked ? "full" : "reduced" })}
              />
            </label>

            <label className="settings-row">
              <span className="settings-row__text">
                <span className="settings-row__name">装饰性阴影与半透明</span>
                <span className="settings-row__desc">
                  弹窗投影、面板半透明背景。关闭可减少合成开销，远程桌面与集显上更明显
                </span>
              </span>
              <input
                type="checkbox"
                className="settings-switch"
                checked={prefs.effects === "on"}
                onChange={(e) => setPrefs({ effects: e.target.checked ? "on" : "off" })}
              />
            </label>

            <p className="settings-note">
              默认关闭两项：本工具的目标机器包含老旧政务台式机，优先保证拖动与缩放跟手。
              关闭它们不影响导出结果与画质，画布渲染与导出始终按完整质量执行。
            </p>
          </section>

          <section className="settings-group">
            <h3 className="settings-group__title">重置</h3>
            <div className="settings-row settings-row--action">
              <span className="settings-row__text">
                <span className="settings-row__desc">
                  恢复导出格式、画布尺寸、排序方式、面板标签与上面两项观感开关
                </span>
              </span>
              <button className="btn-quiet" onClick={reset}>
                恢复默认设置
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
