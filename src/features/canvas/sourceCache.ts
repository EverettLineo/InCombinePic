/**
 * 场景图像源的加载与缓存（画布预览与导出共用）。
 *
 * 为什么独立成模块：导出必须与预览用**同一批位图**。如果导出自己再解码一次，
 * 两次的解码尺寸/方向稍有差异，差分验收就永远过不了。
 */

import type { Id, LibraryItem } from "../../domain/types";
import { prepareThumbnail, toAssetUrl } from "../../platform/ipc";
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

/** 导出前把用到的条目全部加载好，返回可直接渲染的 sources */
export async function ensureSources(
  items: readonly LibraryItem[],
): Promise<Record<Id, SceneImage>> {
  const entries = await Promise.all(
    items.map(async (item) => {
      try {
        return [item.id, await loadSource(item)] as const;
      } catch {
        return [item.id, undefined] as const;
      }
    }),
  );
  const out: Record<Id, SceneImage> = {};
  for (const [id, src] of entries) if (src) out[id] = src;
  return out;
}
