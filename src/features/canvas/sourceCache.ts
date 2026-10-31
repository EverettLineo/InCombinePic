/**
 * 场景图像源的加载与缓存（画布预览与导出共用）。
 *
 * 为什么独立成模块：导出必须与预览用**同一批位图**。如果导出自己再解码一次，
 * 两次的解码尺寸/方向稍有差异，差分验收就永远过不了。
 */

import type { DocumentState, Id, LibraryItem } from "../../domain/types";
import { prepareThumbnail, readImagePng, toAssetUrl } from "../../platform/ipc";
import type { SceneImage } from "../scene/derive";

/**
 * 显示与导出统一按 2048 最长边取位图。
 *
 * 50 张 8000×6000 原图全量驻留约 9 GB（T0.8 实测单张 183 MB），
 * 2048 边长的位图只需其零头。
 */
export const DISPLAY_MAX_EDGE = 2048;

const imageCache = new Map<Id, HTMLImageElement>();
const urlCache = new Map<Id, string>();
const inFlight = new Map<Id, Promise<HTMLImageElement>>();

function toSceneImage(img: HTMLImageElement, item?: LibraryItem): SceneImage {
  const sourceWidth = item?.width ?? 0;
  const pixelScale =
    sourceWidth > 0 && img.naturalWidth > 0 ? img.naturalWidth / sourceWidth : 1;
  return {
    image: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    pixelScale,
  };
}

/** 已缓存的直接同步返回，避免重建后闪一下空白 */
export function getCachedSource(itemId: Id, item?: LibraryItem): SceneImage | undefined {
  const img = imageCache.get(itemId);
  return img ? toSceneImage(img, item) : undefined;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** 确保某条目已解码；并发调用共享同一个 promise */
export async function loadSource(item: LibraryItem): Promise<SceneImage> {
  const cached = imageCache.get(item.id);
  if (cached) return toSceneImage(cached, item);

  let task = inFlight.get(item.id);
  if (!task) {
    task = (async () => {
      let url = urlCache.get(item.id);
      if (!url) {
        const r = await prepareThumbnail(item.sourcePath, DISPLAY_MAX_EDGE);
        url = toAssetUrl(r.path);
        urlCache.set(item.id, url);
      }
      const img = await loadImage(url);
      imageCache.set(item.id, img);
      return img;
    })();
    inFlight.set(item.id, task);
  }

  try {
    return toSceneImage(await task, item);
  } finally {
    inFlight.delete(item.id);
  }
}

/** 导出源的加载上限：再高只会让单张 PNG 动辄几十 MB，收益归零 */
const EXPORT_MAX_EDGE_CAP = 4096;

export interface ExportSources {
  sources: Record<Id, SceneImage>;
  /** 加载失败的条目（导出应因此中止，而不是产出缺图的结果） */
  failed: Id[];
  /** 释放 blob URL 与已解码位图，避免整批原图滞留在内存里 */
  release: () => void;
}

/**
 * 为导出准备图像源（T10.12）。
 *
 * 与预览源有两点不同，都是缺陷驱动出来的：
 *
 * 1. **不用 asset 协议**。`asset.localhost` 与页面不同源，加载的位图会污染 canvas，
 *    导出时 `toBlob` 直接抛 "Tainted canvases may not be exported"（2026-10-31 实测）。
 *    改走 `read_image_png` + `blob:`，同源，不污染。
 * 2. **分辨率按输出尺寸算**，而不是预览用的固定 2048。否则画布 2400 宽时，
 *    导出实际只有 2048 的像素细节，大图必然糊。
 */
export async function loadExportSources(
  doc: DocumentState,
  items: readonly LibraryItem[],
  outWidth: number,
  outHeight: number,
): Promise<ExportSources> {
  const scaleX = outWidth / Math.max(1, doc.canvas.width);
  const scaleY = outHeight / Math.max(1, doc.canvas.height);

  // 同一条目可能被多个实例引用：取最大的像素需求
  const needEdge = new Map<Id, number>();
  for (const inst of doc.instances) {
    const item = items.find((i) => i.id === inst.libraryItemId);
    if (!item) continue;
    // crop 区域要撑满 frame：位图宽度需满足 B >= 源宽 × 显示宽 / crop 宽
    const w = (item.width * inst.frame.w * scaleX) / Math.max(1, inst.crop.w);
    const h = (item.height * inst.frame.h * scaleY) / Math.max(1, inst.crop.h);
    const edge = Math.min(EXPORT_MAX_EDGE_CAP, Math.ceil(Math.max(w, h, 1024)));
    needEdge.set(inst.libraryItemId, Math.max(needEdge.get(inst.libraryItemId) ?? 0, edge));
  }

  const sources: Record<Id, SceneImage> = {};
  const failed: Id[] = [];
  const urls: string[] = [];

  // 串行加载：并发解码十几张大图会瞬间吃掉数百 MB，而导出本来就是要等的操作
  for (const [id, edge] of needEdge) {
    const item = items.find((i) => i.id === id);
    if (!item) {
      failed.push(id);
      continue;
    }
    try {
      const bytes = await readImagePng(item.sourcePath, edge);
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      urls.push(url);
      const img = new Image();
      img.src = url;
      await img.decode();
      sources[id] = toSceneImage(img, item);
    } catch {
      failed.push(id);
    }
  }

  return {
    sources,
    failed,
    release: () => {
      for (const u of urls) URL.revokeObjectURL(u);
      for (const src of Object.values(sources)) {
        if (src.image instanceof HTMLImageElement) src.image.src = "";
      }
    },
  };
}
