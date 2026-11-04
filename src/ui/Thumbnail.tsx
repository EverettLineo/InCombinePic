import { useEffect, useState } from "react";
import { prepareThumbnail, toAssetUrl } from "../platform/ipc";

/**
 * 缩略图加载器，资源库与图层列表共用。
 *
 * 生成缩略图需要先完整解码原图，50 张 8000×6000 同时解码峰值可达 9 GB，
 * 因此限制并发。
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
  /** 尺寸类名（如 lib-item__thumb / layer-item__thumb）；加载与失败态也会保留它 */
  className?: string;
}

export function Thumbnail({ path, maxEdge = 96, alt = "", className }: ThumbnailProps) {
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

  const cls = ["thumb", className].filter(Boolean).join(" ");

  if (failed) {
    return (
      <span className={`${cls} thumb--failed`} title="缩略图生成失败">
        ×
      </span>
    );
  }
  if (!url) {
    return <span className={`${cls} thumb--loading`} />;
  }
  return (
    <img
      className={cls}
      src={url}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
