import { useState } from "react";
import { openAuthorLink } from "../../platform/ipc";
import { useViewStore } from "../../state/viewStore";

/**
 * 关于面板。
 *
 * 集中承担三件事：产品身份（名称、版本、作者、主页）、隐私与离线说明（全应用只在此出现一次）、
 * 何罗鱼的文化出处（古籍原文、释义与设计关联，并区分原文与后世推测）。
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
        <div className="about-hero">
          <img className="about-hero__icon" src="/icon.png" alt="In拼图·何罗鱼 图标" />
          <div className="about-hero__text">
            <div className="about-hero__name">In拼图·何罗鱼</div>
            <div className="about-hero__sub">本地图片拼接 · 山海经神兽工具集</div>
          </div>
          <button className="about-hero__close" onClick={close} title="关闭（Esc）">
            关闭
          </button>
        </div>

        <div className="about-body">
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

          <section className="about-section">
            <h3 className="about-section__title">隐私与离线</h3>
            <ul className="about-list">
              <li>图片解码、渲染、导出全部在本机完成，不会上传任何图片与编辑数据。</li>
              <li>运行期不发起网络请求：无账号、无遥测、无自动更新、无云端同步。</li>
              <li>文档内容（图片、实例、撤销历史）不落盘，关闭应用后不保留。</li>
              <li>
                仅保存界面偏好于 <code>%APPDATA%\com.everettlineo.pintu\prefs.json</code>；
                缩略图缓存位于 <code>%LOCALAPPDATA%\com.everettlineo.pintu\thumbnails</code>。
              </li>
              <li>卸载不会删除你自己导出的图片文件。</li>
            </ul>
          </section>

          <section className="about-section">
            <h3 className="about-section__title">
              何罗鱼 <span className="about-section__tag">《山海经·北山经》</span>
            </h3>
            <blockquote className="about-quote">
              又北四百里，曰谯明之山。谯水出焉，而西流注于河。其中多何罗之鱼，一首而十身，
              其音如吠犬，食之已痈。
            </blockquote>
            <p className="about-p">
              谯明山下，谯水向西汇入黄河，水中有很多何罗鱼。它一个头、十个身子，
              叫声像狗吠；古人相信吃了它能治痈肿。
            </p>
            <p className="about-p">
              取名于此，是因为拼图这件事与它同构：<strong>一个画布，多张图片</strong>。
              「一首」是画布，「十身」是每一张图；十身共享一首，正如多图合成一幅。
              图标里五道流动的色块，取的是「十身」与谯水的意象。
            </p>
            <p className="about-caveat">
              引文依通行本《山海经》，个别字句各版本略有出入。「一首十身」的实物原型并无定论：
              有研究者推测与头足类（章鱼、乌贼）有关，也有解释为群鱼首尾相衔造成的视觉误认。
              这些均属后世推测，<strong>不是古籍原文</strong>。晋代郭璞曾作《山海经图赞》咏此鱼，
              此处不具引，以免转引失真。
            </p>
          </section>

          {error ? <p className="about-dialog__error">{error}</p> : null}

          <p className="about-foot">
            自有代码以 MIT 许可发布；第三方组件许可见随附的 THIRD_PARTY_NOTICES.md。
          </p>
        </div>
      </div>
    </div>
  );
}
