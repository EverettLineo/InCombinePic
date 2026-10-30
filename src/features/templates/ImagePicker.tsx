import { makeInstanceId } from "../../domain/document";
import { findTemplate, placeIntoCell, replaceInstanceSource } from "../../domain/templates";
import type { LibraryItem } from "../../domain/types";
import { askUser } from "../../platform/ipc";
import { useDocStore } from "../../state/docStore";
import { useLibraryStore } from "../../state/libraryStore";
import { useViewStore, type PickerTarget } from "../../state/viewStore";
import { Thumbnail } from "../../ui/Thumbnail";

/**
 * 选图弹窗（T8.5 填空 / T8.6 替换）。
 *
 * 两个用途共用一个弹窗，因为挑选过程完全一样，只是选中之后的落点不同：
 * 填空直接放入；替换要先确认——基线 §9.2 要求替换必须确认，取消则保留原图。
 */
export function ImagePicker() {
  const target = useViewStore((s) => s.picker);
  if (!target) return null;
  return <PickerSession key={targetKey(target)} target={target} />;
}

function targetKey(t: PickerTarget): string {
  return t.kind === "cell" ? `cell-${t.cellIndex}` : `replace-${t.instanceId}`;
}

function PickerSession({ target }: { target: PickerTarget }) {
  const doc = useDocStore((s) => s.doc);
  const commit = useDocStore((s) => s.commit);
  const close = useViewStore((s) => s.closePicker);
  const getSorted = useLibraryStore((s) => s.getSorted);

  const template = findTemplate(doc.templateId);
  const items = getSorted();

  const subtitle =
    target.kind === "cell"
      ? template
        ? `模板「${template.name}」第 ${target.cellIndex + 1} 格`
        : "填入空白单元格"
      : "替换当前图片（裁剪将按新图重置）";

  async function pick(it: LibraryItem) {
    const src = { itemId: it.id, width: it.width, height: it.height };

    if (target.kind === "cell") {
      if (!template) return;
      commit((d) => placeIntoCell(d, template, target.cellIndex, src, makeInstanceId(target.cellIndex)), {
        label: "放入单元格",
      });
      close();
      return;
    }

    const ok = await askUser(
      `将「${it.fileName}」替换到这一格？\n\n位置与边框、圆角、透明度保留；裁剪范围会按新图重置。`,
      "替换",
      "取消",
    );
    if (!ok) return;
    commit((d) => replaceInstanceSource(d, target.instanceId, src), { label: "替换图片" });
    close();
  }

  return (
    <div className="crop-overlay" onPointerDown={close}>
      <div className="picker-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="crop-dialog__head">
          <span className="crop-dialog__title">选择图片</span>
          <span className="crop-dialog__meta">{subtitle}</span>
          <span className="crop-dialog__spacer" />
          <button onClick={close}>关闭</button>
        </div>

        {items.length === 0 ? (
          <div className="empty-hint">资源库为空，请先在左侧导入图片</div>
        ) : (
          <ul className="picker-grid">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  className="picker-item"
                  onClick={() => void pick(it)}
                  title={`${it.fileName} · ${it.width} × ${it.height}`}
                >
                  <Thumbnail
                    path={it.sourcePath}
                    maxEdge={192}
                    alt={it.fileName}
                    className="picker-item__thumb"
                  />
                  <span className="picker-item__name">{it.fileName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
