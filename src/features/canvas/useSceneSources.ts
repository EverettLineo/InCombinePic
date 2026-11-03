import { useEffect, useMemo, useState } from "react";
import type { DocumentState, LibraryItem } from "../../domain/types";
import type { SceneSources } from "../scene/derive";
import { getCachedSource, loadSource, pruneSources } from "./sourceCache";

/**
 * 画布显示用的图像源。
 *
 * 真正的解码与缓存在 `sourceCache` 里，导出复用同一份缓存——
 * 预览与导出必须看到同一批位图，否则差分验收不会过。
 */
export function useSceneSources(doc: DocumentState, items: LibraryItem[]): SceneSources {
  const [sources, setSources] = useState<SceneSources>({});

  const neededKey = useMemo(
    () => Array.from(new Set(doc.instances.map((i) => i.libraryItemId))).join("|"),
    [doc.instances],
  );

  useEffect(() => {
    let alive = true;
    const needed = neededKey ? neededKey.split("|") : [];

    // 不再被画布引用的位图立即释放（50 张 2048px 位图约 800 MB）
    pruneSources(new Set(needed));

    // 先把已缓存的直接同步进来，避免已加载过的图在重建后闪一下空白
    const immediate: SceneSources = {};
    for (const id of needed) {
      const src = getCachedSource(id, items.find((i) => i.id === id));
      if (src) immediate[id] = src;
    }
    // 整体替换而不是合并：已移出画布的条目不该继续留在 state 里
    setSources(() => ({ ...immediate }));

    for (const id of needed) {
      if (immediate[id]) continue;
      const item = items.find((i) => i.id === id);
      if (!item) continue;

      void loadSource(item)
        .then((src) => {
          if (alive) setSources((s) => ({ ...s, [id]: src }));
        })
        .catch(() => {
          // 单张失败不影响其余图片；该实例保持未渲染并计入 pendingCount
        });
    }

    return () => {
      alive = false;
    };
  }, [neededKey, items]);

  return sources;
}
