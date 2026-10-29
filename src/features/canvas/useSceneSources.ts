import { useEffect, useMemo, useState } from "react";
import type { DocumentState, Id, LibraryItem } from "../../domain/types";
import { prepareThumbnail, toAssetUrl } from "../../platform/ipc";
import type { SceneSources } from "../scene/derive";

/**
 * 画布显示用的图像源。
 *
 * 分级解码的显示侧：按 2048 最长边请求位图，而不是把原图整张塞进内存。
 * 50 张 8000×6000 原图全量驻留约 9 GB（T0.8 实测单张 183 MB），
 * 显示尺寸的位图只需其零头。
 */
const DISPLAY_MAX_EDGE = 2048;

const imageCache = new Map<Id, HTMLImageElement>();
const urlCache = new Map<Id, string>();
const inFlight = new Set<Id>();

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export function useSceneSources(doc: DocumentState, items: LibraryItem[]): SceneSources {
  const [sources, setSources] = useState<SceneSources>({});

  const neededKey = useMemo(
    () => Array.from(new Set(doc.instances.map((i) => i.libraryItemId))).join("|"),
    [doc.instances],
  );

  useEffect(() => {
    let alive = true;
    const needed = neededKey ? neededKey.split("|") : [];

    // 先把已缓存的直接同步进来，避免已加载过的图在重建后闪一下空白
    const immediate: SceneSources = {};
    for (const id of needed) {
      const img = imageCache.get(id);
      if (img) immediate[id] = { image: img, width: img.naturalWidth, height: img.naturalHeight };
    }
    if (Object.keys(immediate).length > 0) {
      setSources((s) => ({ ...s, ...immediate }));
    }

    for (const id of needed) {
      if (imageCache.has(id) || inFlight.has(id)) continue;
      const item = items.find((i) => i.id === id);
      if (!item) continue;

      inFlight.add(id);
      void (async () => {
        try {
          let url = urlCache.get(id);
          if (!url) {
            const r = await prepareThumbnail(item.sourcePath, DISPLAY_MAX_EDGE);
            url = toAssetUrl(r.path);
            urlCache.set(id, url);
          }
          const img = await loadImage(url);
          imageCache.set(id, img);
          if (alive) {
            setSources((s) => ({
              ...s,
              [id]: { image: img, width: img.naturalWidth, height: img.naturalHeight },
            }));
          }
        } catch {
          // 单张失败不影响其余图片；该实例会保持未渲染并计入 pendingCount
        } finally {
          inFlight.delete(id);
        }
      })();
    }

    return () => {
      alive = false;
    };
  }, [neededKey, items]);

  return sources;
}
