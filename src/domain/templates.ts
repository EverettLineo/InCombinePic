/**
 * 模板定义与模板布局（T8.1 / T8.2 / T8.3 / T8.4 / T8.8）。
 *
 * 单元格用**归一化坐标**（0~1，相对画布）定义，换算时才乘画布尺寸：
 * 画布尺寸可被用户修改（T3.5），若模板按像素写死，改一次画布所有模板都失效。
 *
 * 像素换算时**先算边再相减**（left/right 各自取整），而不是"位置取整 + 宽度取整"。
 * 后者会让相邻单元格之间出现 1px 缝隙——无缝布局（gap=0）下尤其明显（G8 验收项）。
 */

import { createInstance, nextCreatedSeq } from "./document";
import type { DocumentState, Frame, Id, LibraryItem } from "./types";

export interface TemplateCell {
  /** 归一化矩形：左/上/宽/高，取值 0~1 */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TemplateCategory = "grid" | "long" | "columns" | "asymmetric" | "wall";

export interface TemplateDef {
  id: string;
  name: string;
  category: TemplateCategory;
  cells: TemplateCell[];
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  grid: "基础网格",
  long: "长图",
  columns: "多列排版",
  asymmetric: "不对称",
  wall: "照片墙",
};

/** 用 [x, y, w, h] 四元组声明单元格，避免满屏的对象字面量 */
function cells(...rects: Array<[number, number, number, number]>): TemplateCell[] {
  return rects.map(([x, y, w, h]) => ({ x, y, w, h }));
}

/** 等分网格 */
function grid(cols: number, rows: number): TemplateCell[] {
  const out: TemplateCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: c / cols, y: r / rows, w: 1 / cols, h: 1 / rows });
    }
  }
  return out;
}

/**
 * 20 个 v1 模板（D-07 的分类配额：网格 6 / 长图 3 / 多列 4 / 不对称 4 / 照片墙 3）。
 *
 * 约束：每个模板的单元格面积之和必须等于 1（铺满画布），且互不重叠。
 * 该约束由单测强制——手写坐标最容易出现的错误就是留下一条没人注意的空白缝。
 */
export const TEMPLATES: TemplateDef[] = [
  // ---------- 基础网格 6 ----------
  { id: "grid-2x2", name: "四分格", category: "grid", cells: grid(2, 2) },
  { id: "grid-3x2", name: "六分格", category: "grid", cells: grid(3, 2) },
  { id: "grid-2x3", name: "竖六分格", category: "grid", cells: grid(2, 3) },
  { id: "grid-3x3", name: "九宫格", category: "grid", cells: grid(3, 3) },
  { id: "grid-4x2", name: "八分格", category: "grid", cells: grid(4, 2) },
  { id: "grid-4x3", name: "十二分格", category: "grid", cells: grid(4, 3) },

  // ---------- 长图 3 ----------
  {
    id: "long-1x3",
    name: "三联竖条",
    category: "long",
    cells: cells([0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]),
  },
  {
    id: "long-1x4",
    name: "四联竖条",
    category: "long",
    cells: cells([0, 0, 1, 0.25], [0, 0.25, 1, 0.25], [0, 0.5, 1, 0.25], [0, 0.75, 1, 0.25]),
  },
  {
    id: "long-2x4",
    name: "双列长图",
    category: "long",
    cells: grid(2, 4),
  },

  // ---------- 多列排版 4 ----------
  {
    id: "col-2-uneven",
    name: "宽窄两列",
    category: "columns",
    cells: cells([0, 0, 0.62, 1], [0.62, 0, 0.38, 1]),
  },
  {
    id: "col-3-even",
    name: "三列等分",
    category: "columns",
    cells: cells([0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]),
  },
  {
    id: "col-3-center",
    name: "中间主图三列",
    category: "columns",
    cells: cells([0, 0, 0.22, 1], [0.22, 0, 0.56, 1], [0.78, 0, 0.22, 1]),
  },
  {
    id: "col-2-stagger",
    name: "两列错层",
    category: "columns",
    cells: cells([0, 0, 0.5, 0.45], [0.5, 0, 0.5, 0.55], [0, 0.45, 0.5, 0.55], [0.5, 0.55, 0.5, 0.45]),
  },

  // ---------- 不对称 4 ----------
  {
    id: "asym-big-left",
    name: "左大右二",
    category: "asymmetric",
    cells: cells([0, 0, 0.66, 1], [0.66, 0, 0.34, 0.5], [0.66, 0.5, 0.34, 0.5]),
  },
  {
    id: "asym-big-top",
    name: "上大下三",
    category: "asymmetric",
    cells: cells(
      [0, 0, 1, 0.62],
      [0, 0.62, 1 / 3, 0.38],
      [1 / 3, 0.62, 1 / 3, 0.38],
      [2 / 3, 0.62, 1 / 3, 0.38],
    ),
  },
  {
    id: "asym-offset",
    name: "错位两列",
    category: "asymmetric",
    cells: cells([0, 0, 0.5, 0.62], [0.5, 0, 0.5, 0.38], [0, 0.62, 0.5, 0.38], [0.5, 0.38, 0.5, 0.62]),
  },
  {
    id: "asym-corner",
    name: "主角与边角",
    category: "asymmetric",
    cells: cells(
      [0, 0, 0.7, 0.7],
      [0.7, 0, 0.3, 0.35],
      [0.7, 0.35, 0.3, 0.35],
      [0, 0.7, 0.35, 0.3],
      [0.35, 0.7, 0.65, 0.3],
    ),
  },

  // ---------- 照片墙 3 ----------
  {
    id: "wall-3col",
    name: "三列错落",
    category: "wall",
    cells: cells(
      [0, 0, 1 / 3, 0.55],
      [1 / 3, 0, 1 / 3, 0.4],
      [2 / 3, 0, 1 / 3, 0.55],
      [0, 0.55, 1 / 3, 0.45],
      [1 / 3, 0.4, 1 / 3, 0.35],
      [2 / 3, 0.55, 1 / 3, 0.45],
      [1 / 3, 0.75, 1 / 3, 0.25],
    ),
  },
  {
    id: "wall-4col",
    name: "四列高低",
    category: "wall",
    cells: cells(
      [0, 0, 0.25, 0.6],
      [0.25, 0, 0.25, 0.35],
      [0.5, 0, 0.25, 0.6],
      [0.75, 0, 0.25, 0.45],
      [0, 0.6, 0.25, 0.4],
      [0.25, 0.35, 0.25, 0.65],
      [0.5, 0.6, 0.25, 0.4],
      [0.75, 0.45, 0.25, 0.55],
    ),
  },
  {
    id: "wall-2row",
    name: "两行错落",
    category: "wall",
    cells: cells(
      [0, 0, 0.4, 0.5],
      [0.4, 0, 0.3, 0.5],
      [0.7, 0, 0.3, 0.5],
      [0, 0.5, 0.3, 0.5],
      [0.3, 0.5, 0.45, 0.5],
      [0.75, 0.5, 0.25, 0.5],
    ),
  },
];

export function findTemplate(id: string | null | undefined): TemplateDef | undefined {
  if (!id) return undefined;
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * 归一化单元格 → 画布像素矩形。
 * 间距按"每个格子四周各内缩 gap/2"处理：相邻格子间隔正好是 gap，画布外边缘是 gap/2。
 */
export function templateFrames(
  template: TemplateDef,
  canvas: { width: number; height: number },
  gap = 0,
): Frame[] {
  const g = Math.max(0, gap);
  return template.cells.map((c) => {
    const left = Math.round(c.x * canvas.width + g / 2);
    const top = Math.round(c.y * canvas.height + g / 2);
    const right = Math.round((c.x + c.w) * canvas.width - g / 2);
    const bottom = Math.round((c.y + c.h) * canvas.height - g / 2);
    return {
      x: left,
      y: top,
      w: Math.max(1, right - left),
      h: Math.max(1, bottom - top),
    };
  });
}

/** 单元格是否已被某个实例占据：用实例中心落点判断，避免浮点相等比较 */
function isCellOccupied(frames: readonly Frame[], doc: DocumentState): boolean[] {
  return frames.map((f) => {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    return doc.instances.some(
      (it) => cx >= it.frame.x && cx <= it.frame.x + it.frame.w && cy >= it.frame.y && cy <= it.frame.y + it.frame.h,
    );
  });
}

/** 空白单元格下标（T8.4「空格留空」+ T8.5 点击填空） */
export function emptyCellIndices(doc: DocumentState, template: TemplateDef): number[] {
  const frames = templateFrames(template, doc.canvas, doc.gap);
  const occupied = isCellOccupied(frames, doc);
  return frames.map((_, i) => i).filter((i) => !occupied[i]);
}

export interface FillSource {
  itemId: Id;
  width: number;
  height: number;
}

/**
 * 按模板重排画布（T8.8 的九条语义）。
 *
 * - 按 `order`（资源库当前生效顺序）逐个填格，一个条目一格，不重复创建（规则 5）；
 * - 条目已有实例时复用**最早创建**的那个，其余同条目实例移出画布（规则 3）；
 * - 复用实例保留裁剪/旋转/翻转/透明度/边框/圆角，仅重设 frame（规则 8）；
 * - 未进入新布局的实例全部移出画布，资源库条目不动（规则 7）；
 * - 资源不够时剩余格子留空（规则 6）。
 */
export function applyTemplate(
  doc: DocumentState,
  template: TemplateDef,
  order: readonly FillSource[],
  newId: (index: number) => Id,
): DocumentState {
  const frames = templateFrames(template, doc.canvas, doc.gap);

  // 按资源库条目分组，组内按 createdSeq 升序（最早创建的在前）
  const byItem = new Map<Id, typeof doc.instances>();
  for (const inst of doc.instances) {
    const list = byItem.get(inst.libraryItemId);
    if (list) list.push(inst);
    else byItem.set(inst.libraryItemId, [inst]);
  }
  for (const list of byItem.values()) list.sort((a, b) => a.createdSeq - b.createdSeq);

  let seq = nextCreatedSeq(doc);
  const next: typeof doc.instances = [];

  const count = Math.min(frames.length, order.length);
  for (let i = 0; i < count; i++) {
    const src = order[i];
    const reusable = byItem.get(src.itemId)?.[0];
    if (reusable) {
      // 复用：只改位置尺寸，图像级属性原样保留
      next.push({ ...reusable, frame: { ...frames[i] } });
      byItem.get(src.itemId)!.shift();
    } else {
      const created = createInstance(doc, {
        id: newId(i),
        libraryItemId: src.itemId,
        sourceWidth: Math.max(1, src.width),
        sourceHeight: Math.max(1, src.height),
        frame: frames[i],
        seq,
      });
      seq += 1;
      next.push(created);
    }
  }

  return { ...doc, templateId: template.id, instances: next };
}

/** 把某个资源放进指定单元格（点击空白格，T8.5） */
export function placeIntoCell(
  doc: DocumentState,
  template: TemplateDef,
  cellIndex: number,
  src: FillSource,
  id: Id,
): DocumentState {
  const frames = templateFrames(template, doc.canvas, doc.gap);
  const frame = frames[cellIndex];
  if (!frame) return doc;
  const inst = createInstance(doc, {
    id,
    libraryItemId: src.itemId,
    sourceWidth: Math.max(1, src.width),
    sourceHeight: Math.max(1, src.height),
    frame,
  });
  return { ...doc, instances: [...doc.instances, inst] };
}

/** 替换实例的图片来源：保留位置与外观属性，裁剪按新图重置（新图尺寸不同，旧裁剪无意义） */
export function replaceInstanceSource(
  doc: DocumentState,
  instanceId: Id,
  src: FillSource,
): DocumentState {
  let changed = false;
  const next = doc.instances.map((it) => {
    if (it.id !== instanceId) return it;
    changed = true;
    return {
      ...it,
      libraryItemId: src.itemId,
      crop: { x: 0, y: 0, w: Math.max(1, src.width), h: Math.max(1, src.height) },
    };
  });
  return changed ? { ...doc, instances: next } : doc;
}

/** 资源库顺序（当前生效顺序）→ 填充源列表 */
export function fillSourcesOf(items: readonly LibraryItem[]): FillSource[] {
  return items.map((it) => ({ itemId: it.id, width: it.width, height: it.height }));
}
