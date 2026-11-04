/**
 * 条带渲染：把画布场景按行区间渲染为 PNG。
 *
 * 渲染留在前端，与预览共用同一套几何：若在 Rust 重写一遍，裁剪、圆角、边框、旋转的规则
 * 要在两处维护，像素一致性迟早失守（见 docs/adr/ADR-0008）。
 * 条带化用于绕开画布尺寸与内存限制，一次只渲染 2048 行。
 */

import Konva from "konva";
import type { DocumentState } from "../../domain/types";
import { syncBackground, syncLayer } from "../scene/apply";
import { deriveScene, type SceneSources } from "../scene/derive";

export interface StripRenderOptions {
  doc: DocumentState;
  sources: SceneSources;
  /** 输出像素尺寸（可能大于画布，按比例放大） */
  outWidth: number;
  outHeight: number;
  /** 本条带在输出图中的起始行 */
  rowStart: number;
  /** 实际渲染行数（含 1px 重叠） */
  renderRows: number;
  /** PNG + 透明背景：不画背景，保留 alpha */
  skipBackground: boolean;
  /** JPEG + 透明背景：铺白，避免出现未合成区域 */
  forceWhite: boolean;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(reader.error ?? new Error("读取条带数据失败"));
    reader.readAsDataURL(blob);
  });
}

/** 渲染一条条带，返回 base64 编码的 PNG（不含 data: 前缀） */
export async function renderStripBase64(opts: StripRenderOptions): Promise<string> {
  const { doc, sources, outWidth, outHeight } = opts;
  const canvasW = Math.max(1, doc.canvas.width);
  const canvasH = Math.max(1, doc.canvas.height);

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;";
  document.body.appendChild(host);

  const stage = new Konva.Stage({
    container: host,
    width: Math.max(1, Math.round(outWidth)),
    height: Math.max(1, Math.round(opts.renderRows)),
  });

  try {
    const scaleX = outWidth / canvasW;
    const scaleY = outHeight / canvasH;
    stage.scale({ x: scaleX, y: scaleY });
    // 条带起点：把输出行 rowStart 移到画布顶端
    stage.position({ x: 0, y: -opts.rowStart });

    const bg = new Konva.Layer({ listening: false });
    const content = new Konva.Layer({ listening: false });
    stage.add(bg);
    stage.add(content);

    if (opts.forceWhite) {
      bg.add(
        new Konva.Rect({
          x: 0,
          y: 0,
          width: canvasW,
          height: canvasH,
          fill: "#ffffff",
          listening: false,
        }),
      );
    } else if (!opts.skipBackground) {
      syncBackground(bg, doc.canvas);
    }

    // 与预览同一处裁切：内容超出画布的部分不进入导出
    content.clip({ x: 0, y: 0, width: canvasW, height: canvasH });
    syncLayer(content, deriveScene(doc, sources));

    bg.draw();
    content.draw();

    const canvas = stage.toCanvas({ pixelRatio: 1 });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) throw new Error("条带编码失败（toBlob 返回空）");
    return await blobToBase64(blob);
  } finally {
    stage.destroy();
    host.remove();
  }
}
