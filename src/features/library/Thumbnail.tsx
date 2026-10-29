import { useEffect, useState } from "react";
import { prepareThumbnail, toAssetUrl } from "../../platform/ipc";

/**
 * 缩略图加载器。
 *
 * 为什么要限并发：生成缩略图需要先把原图完整解码。
 * 50 张 8000×6000 的图若同时解码，峰值内存会到 9 GB 量级，
 * 直接把应用拖死（T0.8 实测单张 RGBA 183 MB）。
 */
const MAX_CONCURRENT = 3;
let running = 0;
const waiters: Array<() => void> = [];
const cache = new Map<string, string>();

function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      running += 1;
      resolve();
    });
  });
}

function release(): void {
  running -= 1;
  const next = waiters.shift();
  if (next) next();
}

function keyOf(path: string, maxEdge: number): string {
  return `${path}|${maxEdge}`;
}

async function loadThumbnail(path: string, maxEdge: number): Promise<string> {
  const key = keyOf(path, maxEdge);
  const hit = cache.get(key);
  if (hit) return hit;

  await acquire();
  try {
    const r = await prepareThumbnail(path, maxEdge);
    const url = toAssetUrl(r.path);
    cache.set(key, url);
    return url;
  } finally {
    release();
  }
}

interface ThumbnailProps {
  path: string;
  maxEdge?: number;
  alt?: string;
  /** 可替换外层类名（列表用 36px 缩略图，预览用大图样式） */
  className?: string;
}

export function Thumbnail({
  path,
  maxEdge = 96,
  alt = "",
  className = "lib-item__thumb",
}: ThumbnailProps) {
  const [url, setUrl] = useState<string | null>(
    () => cache.get(keyOf(path, maxEdge)) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (url) return;
    let alive = true;
    loadThumbnail(path, maxEdge)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [path, maxEdge, url]);

  if (failed) {
    return (
      <span className={`${className} ${className}--failed`} title="缩略图生成失败">
        ×
      </span>
    );
  }
  if (!url) {
    return <span className={`${className} ${className}--loading`} />;
  }
  return (
    <img
      className={className}
      src={url}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
