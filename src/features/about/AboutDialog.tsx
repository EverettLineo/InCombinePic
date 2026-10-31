import { useState } from "react";
import { openAuthorLink } from "../../platform/ipc";
import { useViewStore } from "../../state/viewStore";

/**
 * 关于面板。
 *
 * 放的不只是致谢：应用名、版本、作者与两个主页入口都在这里。
 * 安装包里没有 README，这个面板是用户能找到出处的唯一地方。
 */
export function AboutDialog({ version }: { version: string }) {
  const open = useViewStore((s) => s.aboutOpen);
  const close = useViewStore((s) => s.closeAbout);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function go(which: "github" | "site") {
    setError(null);
    try {
      await openAuthorLink(which);
    } catch {
      setError("无法打开浏览器，请手动访问链接地址");
    }
  }

  return (
    <div className="crop-overlay" onPointerDown={close}>
      <div className="about-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="about-dialog__head">
          <span className="about-dialog__logo">In</span>
          <div>
            <div className="about-dialog__name">In拼图</div>
            <div className="about-dialog__sub">本地图片拼接工具 · 全部处理在本机完成</div>
          </div>
          <span className="crop-dialog__spacer" />
          <button onClick={close} title="关闭（Esc）">
            关闭
          </button>
        </div>

        <div className="about-dialog__body">
          <dl className="about-facts">
            <dt>作者</dt>
            <dd>林间Inline（Everett Lineo）</dd>
            <dt>版本</dt>
            <dd>{version ? `v${version}` : "—"}</dd>
            <dt>主页</dt>
            <dd>
              <button className="about-link" onClick={() => void go("site")}>
                everettlineo.github.io
              </button>
            </dd>
            <dt>源码</dt>
            <dd>
              <button className="about-link" onClick={() => void go("github")}>
                github.com/EverettLineo
              </button>
            </dd>
          </dl>

          <p className="about-dialog__note">
            图片与编辑数据只在本机内存与本地磁盘中流转，不上传、不联网、无遥测。
            文档内容不落盘，关闭应用后不会保留。
          </p>

          {error ? <p className="about-dialog__error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
