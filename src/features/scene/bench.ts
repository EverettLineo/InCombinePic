/**
 * 画布渲染基准（T3.7）。
 *
 * 为什么必须用 `layer.draw()` 而不是 `batchDraw()`：
 * batchDraw 只是把重绘排进下一帧，测到的是"入队耗时"，
 * 据此推算 FPS 会得出荒谬数值（KI-04 记录过这个坑）。
 * 这里测的是同步光栅化耗时，才是真实成本。
 */

import Konva from "konva";
import { deriveScene, type SceneSources } from "./derive";
import { syncBackground, syncLayer } from "./apply";
import type { CanvasInstance, DocumentState } from "../../domain/types";

const INSTANCES = 50;
const FRAMES = 90;
const CANVAS = { width: 2400, height: 1600 };

function makeSources(): SceneSources {
  const sources: SceneSources = {};
  for (let i = 0; i < INSTANCES; i++) {
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 360;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 480, 360);
    g.addColorStop(0, `hsl(${(i * 7) % 360},70%,62%)`);
    g.addColorStop(1, `hsl(${(i * 13) % 360},70%,34%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 360);
    for (let k = 0; k < 80; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.04 + (k % 5) * 0.02})`;
      ctx.fillRect((k * 37) % 480, (k * 23) % 360, 26, 26);
    }
    sources[`lib-${i}`] = { image: c, width: 480, height: 360, pixelScale: 1 };
  }
  return sources;
}

function makeDoc(): DocumentState {
  const cols = 10;
  const rows = Math.ceil(INSTANCES / cols);
  const cellW = CANVAS.width / cols;
  const cellH = CANVAS.height / rows;
  const instances: CanvasInstance[] = [];
  for (let i = 0; i < INSTANCES; i++) {
    instances.push({
      id: `inst-${i}`,
      libraryItemId: `lib-${i}`,
      createdSeq: i,
      frame: {
        x: Math.round((i % cols) * cellW + 6),
        y: Math.round(Math.floor(i / cols) * cellH + 6),
        w: Math.round(cellW - 12),
        h: Math.round(cellH - 12),
      },
      crop: { x: 0, y: 0, w: 480, h: 360 },
      rotation: (i % 4) * 90 as 0 | 90 | 180 | 270,
      flipH: i % 3 === 0,
      flipV: false,
      opacity: 0.7 + (i % 4) * 0.1,
      border: { width: 0, color: "#000000" },
      cornerRadius: 0,
    });
  }
  return {
    canvas: { ...CANVAS, background: { type: "white" } },
    instances,
    templateId: null,
    gap: 0,
    fitMode: "fill",
  };
}

function stats(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b);
  const p = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    avg: +avg.toFixed(2),
    p50: +p(0.5).toFixed(2),
    p95: +p(0.95).toFixed(2),
    max: +s[s.length - 1].toFixed(2),
  };
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export interface BenchMetrics {
  runtime: string;
  konva: string;
  devicePixelRatio: number;
  instances: number;
  canvas: { width: number; height: number };
  results: Array<{
    zoom: number;
    viewport: { w: number; h: number };
    pipelinePerFrame: ReturnType<typeof stats>;
    drawOnlyPerFrame: ReturnType<typeof stats>;
    headroomAt60Hz: string;
  }>;
  fullRebuildMs: number;
}

export async function runCanvasBench(host: HTMLDivElement): Promise<BenchMetrics> {
  const sources = makeSources();
  const doc = makeDoc();
  const vw = Math.max(400, host.clientWidth);
  const vh = Math.max(300, host.clientHeight);

  const stage = new Konva.Stage({ container: host, width: vw, height: vh });
  const bgLayer = new Konva.Layer({ listening: false });
  const contentLayer = new Konva.Layer({ listening: false });
  stage.add(bgLayer);
  stage.add(contentLayer);

  syncBackground(bgLayer, doc.canvas);
  contentLayer.clip({ x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height });

  const results: BenchMetrics["results"] = [];
  const zooms = [Math.min(vw / CANVAS.width, vh / CANVAS.height), 1];

  let fullRebuildMs = 0;

  for (const zoom of zooms) {
    stage.scale({ x: zoom, y: zoom });
    stage.position({ x: 0, y: 0 });

    // 预热 + 首屏（新建节点）
    const tRebuild = performance.now();
    contentLayer.destroyChildren();
    syncLayer(contentLayer, deriveScene(doc, sources));
    contentLayer.draw();
    fullRebuildMs = performance.now() - tRebuild;
    await nextFrame();

    const pipeline: number[] = [];
    const drawOnly: number[] = [];
    const work: DocumentState = { ...doc, instances: doc.instances.map((i) => ({ ...i })) };

    for (let f = 0; f < FRAMES; f++) {
      await nextFrame();
      const inst0 = work.instances[0];
      inst0.frame = { ...inst0.frame, x: 20 + Math.sin(f / 6) * 120 };

      const t0 = performance.now();
      const scene = deriveScene(work, sources);
      syncLayer(contentLayer, scene);
      const t1 = performance.now();
      contentLayer.draw();
      const t2 = performance.now();

      pipeline.push(t2 - t0);
      drawOnly.push(t2 - t1);
    }

    const pStat = stats(pipeline);
    const dStat = stats(drawOnly);
    results.push({
      zoom: +zoom.toFixed(3),
      viewport: { w: vw, h: vh },
      pipelinePerFrame: pStat,
      drawOnlyPerFrame: dStat,
      headroomAt60Hz: `每帧同步耗时 p95=${pStat.p95}ms，16.7ms 预算的 ${(
        (pStat.p95 / 16.7) * 100
      ).toFixed(1)}%`,
    });
  }

  stage.destroy();

  return {
    runtime: navigator.userAgent,
    konva: Konva.version,
    devicePixelRatio: window.devicePixelRatio,
    instances: INSTANCES,
    canvas: CANVAS,
    results,
    fullRebuildMs: +fullRebuildMs.toFixed(2),
  };
}
