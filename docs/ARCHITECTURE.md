# 系统架构设计

- 版本：arch-v1（对应 ADR-0001）
- 日期：2026-10-27
- 前置决策：`docs/adr/ADR-0001-base-selection.md`、调研数据 `docs/OPEN_SOURCE_SURVEY.md`

---

## 1. 分层与依赖方向

严格单向依赖，反向引用一律视为架构违规。

```
┌─────────────────────────────────────────────────┐
│  app / ui          应用装配、通用控件            │
├─────────────────────────────────────────────────┤
│  features/*        资源库、画布、属性、图层、模板、导出 │
├─────────────────────────────────────────────────┤
│  domain            文档模型、几何、变换、命令、历史   │  ← 纯 TS，零外部依赖
└──────────────┬──────────────────────────────────┘
               │ 只经 platform 这一层
        ┌──────▼──────┐        ┌──────────────────┐
        │  platform   │◄──IPC──►│  Rust (src-tauri)│
        └─────────────┘        └──────────────────┘
```

三条硬规则：

1. **`domain` 不得 import React、Konva、`@tauri-apps/*`。** 它是纯数据与纯函数，可独立单测。
2. **只有 `features/scene` 可以 import Konva。** 其余代码不允许出现 Konva 类型，防止引擎渗透进业务。
3. **只有 `platform` 可以发起 IPC。** 便于统一错误处理、埋点与测试替身。

> 落地手段：在 ESLint 中配置 `import/no-restricted-paths` 把上述三条变成构建期报错，而不是靠自觉。此项列入 T1.5。

---

## 2. 目录结构

```
puzzle-tool/
├─ src/
│  ├─ app/                  App 入口、三栏布局、快捷键注册
│  ├─ domain/               ★ 纯领域层
│  │  ├─ types.ts           四类模型定义（见 §3）
│  │  ├─ geometry.ts        矩形运算、命中测试、cover/contain
│  │  ├─ transform.ts       变换管线（见 §4）
│  │  ├─ layout/            初始布局、模板布局、对齐与分布算法
│  │  ├─ commands/          命令定义与 reducer
│  │  └─ history.ts         撤销栈、事务合并
│  ├─ features/
│  │  ├─ library/           导入、排序、预览、释放
│  │  ├─ canvas/            视图状态、缩放平移、坐标换算
│  │  ├─ scene/             SceneDescriptor 派生 + Konva 适配（唯一 Konva 出口）
│  │  ├─ inspector/         裁剪框、透明度、边框、圆角
│  │  ├─ layers/            图层列表（顺序 = 堆叠）
│  │  ├─ templates/         模板选择与填充
│  │  └─ export/            导出面板、条带任务调度
│  ├─ platform/             IPC 封装（全部 Rust 调用集中于此）
│  ├─ ui/                   Button / Slider / NumberField / Dialog / Toast
│  └─ styles/               浅色主题 token
├─ src-tauri/
│  ├─ src/
│  │  ├─ commands/          IPC 命令注册
│  │  ├─ imaging/           解码、EXIF 方向、ICC、分级重采样
│  │  ├─ encode/            PNG / JPEG 编码与元数据清除
│  │  ├─ export/            条带接收、临时文件、原子落盘
│  │  ├─ prefs/             偏好读写（应用配置目录）
│  │  └─ error.rs           统一错误码 → 中文文案
│  └─ tauri.conf.json
├─ docs/                    REQUIREMENTS / ARCHITECTURE / adr / TASKS ...
└─ task.md                  任务真源
```

---

## 3. 数据模型

四类模型对应基线 §4.2 的四个概念，一一对齐，不合并。

```ts
type Id = string;

/** 概念 1：资源库条目。同路径可存在多条，互不影响 */
interface LibraryItem {
  id: Id;
  sourcePath: string;   // 仅用于"同路径判重"（基线 §6.4 明确不做内容哈希）
  fileName: string;
  importSeq: number;    // 导入序号：同名文件的稳定次级排序依据
  importedAt: number;
  width: number;        // 已应用 EXIF Orientation 后的原始像素尺寸
  height: number;
  format: 'png' | 'jpeg' | 'webp' | 'bmp';
  hasAlpha: boolean;
}

/** 概念 2：画布图片实例。同一资源可多次放置，各自独立 */
interface CanvasInstance {
  id: Id;
  libraryItemId: Id;
  createdSeq: number;                                   // 模板复用"最早创建"的判定依据
  frame: { x: number; y: number; w: number; h: number }; // 画布坐标系下的轴对齐显示框
  crop: { x: number; y: number; w: number; h: number };  // 源像素坐标，非破坏性
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  opacity: number;                                      // 0..1
  border: { width: number; color: string };
  cornerRadius: number;
}

/** 概念 3：画布文档状态。撤销/重做的作用对象 */
interface DocumentState {
  canvas: { width: number; height: number; background: Background };
  instances: CanvasInstance[];   // 数组顺序 = 图层顺序（底 → 顶）
  templateId: string | null;
  gap: number;                   // 统一间距；无缝模式恒为 0
  fitMode: 'fill' | 'contain';   // 全局模板适配模式（基线 §9.3）
}

type Background =
  | { type: 'white' }
  | { type: 'transparent' }
  | { type: 'solid'; color: string }
  | { type: 'linear'; from: string; to: string; angle: number };

/** 概念 4：视图状态。不入历史、不持久化、不影响导出像素 */
interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  selection: Id[];
}
```

**三条建模决策：**

1. `instances` 用**数组顺序**表达图层顺序，而非每项存 `zIndex`。避免出现序数空洞与重复值，拖拽排序退化为数组移动。
2. `crop` 始终相对**源图像素**，不随旋转改变。这样"旋转后再裁剪、再撤销旋转"不会破坏裁剪数据（基线 §8.3 的硬要求）。
3. `ViewState` 与 `DocumentState` 完全分离。选中状态变化**不产生撤销记录**——这是很多同类工具体验崩坏的地方。

---

## 4. 变换管线（预览与导出的唯一语义）

单个实例的绘制顺序**固定**如下，文档即契约，任何实现不得调整次序：

```
源图像素
 ① crop        按 crop 矩形截取源像素          → 得到图像 C
 ② flip        以 C 的中心为轴做水平/垂直镜像   → C'
 ③ rotate      以 C' 的中心顺时针旋转 90°×n    → C''
 ④ fit         按 fitMode 把 C'' 映射进 frame  → 屏幕像素
 ⑤ composite   以 opacity 合成到画布
 ⑥ clip+stroke 裁剪到圆角矩形，绘制内描边
```

**关键定义（消除歧义，避免预览/导出不一致）：**

- `frame` 是**轴对齐显示框**，是布局的唯一尺寸依据。旋转作用于**内容**，不改变 `frame`。
- 90° 旋转后图像宽高互换，此时按 `fitMode` 重新适配进 `frame`：
  - `fill`：等比放大至完全覆盖 `frame`，超出部分裁掉（基线 §9.3 默认行为）；
  - `contain`：等比缩放至完整可见，剩余区域露出背景。
- **`fit` 产生的裁切不回写 `crop`。** 用户裁剪与适配裁切是两层，混写会导致切换模板后用户裁剪丢失。
- 边框采用**内描边**（stroke 向内），保证不改变 `frame` 尺寸与布局计算。
- 变换输出为显式矩阵，集中在 `domain/transform.ts`，由预览与导出的条带渲染**调用同一个函数**。

---

## 5. 导出链路（条带化）

```
ExportRequest { format, outW, outH, quality, targetPath }
        │
        ├─ stripCount = ceil(outH / STRIP_H)          STRIP_H 初值 2048
        │
        └─ for each strip i:
             ① 前端把场景以 (outW × stripH) 渲染（复用同一 Konva 渲染路径）
             ② 像素按整数对齐，条带边界重叠 1px 采样，消除接缝
             ③ 传输到 Rust（先做 PNG 编码传输，压测后再定是否改原始 RGBA）
             ④ Rust 解码该条 → 写入编码器第 i 段
             ⑤ 立即释放该条 canvas
        │
        └─ finish：写临时文件 → 成功后 rename 到目标路径（原子落盘）
```

**为什么必须这样：**

- 20,000 × 20,000 RGBA ≈ 1.6 GB，单一 canvas 必然失败；条带把峰值压到 `outW × 2048 × 4B ≈ 164 MB`。
- 前端只用同一个渲染器，从根上避免"预览对、导出错"（基线 §4.1 红线）。
- 原子落盘保证导出失败不留下半截文件、不破坏已存在的目标文件（基线 §12.5、§12.4）。

**待实现期验证的点（不预设结论）：**

| 待验证 | 说明 | 归属 |
| --- | --- | --- |
| JPEG 条带编码器 | JPEG 为整帧编码，需支持逐段写入的编码器（`jpeg-encoder` 的 strip 写入能力需实测确认） | T10.x |
| 传输格式 | PNG 中转（省带宽、耗 CPU）vs 原始 RGBA（省 CPU、耗内存），以压测决定 | T10.x |
| 条带接缝 | 抗锯齿边缘是否出现 1px 亮线，用差分测试判定 | T10.11 |
| 20,000 px 实际上限 | 内存与耗时实测，必要时下调并记录 | T0.9 / T12.4 |

---

## 6. IPC 契约（草案）

命令集中于 `src-tauri/src/commands/`，前端只在 `platform/` 调用。

| 命令 | 入参 | 返回 | 说明 |
| --- | --- | --- | --- |
| `probe_files` | `paths: string[]` | `ProbeOutcome[]` | 批量探测格式/尺寸/EXIF/alpha；**单文件失败不影响其他** |
| `pick_files` | — | `string[]` | 系统文件选择器 |
| `read_clipboard_image` | — | `ProbeOutcome \| null` | 剪贴板取图，写临时文件后按普通资源入库 |
| `prepare_display` | `itemId, maxEdge` | `assetUrl, w, h` | 生成显示用位图（分级解码，见下） |
| `export_begin` | `ExportRequest` | `jobId` | 创建导出任务 |
| `export_append_strip` | `jobId, index, bytes` | `void` | 追加一条带 |
| `export_finish` | `jobId` | `savedPath` | 原子落盘 |
| `export_cancel` | `jobId` | `void` | 清理临时文件 |
| `prefs_load` / `prefs_save` | — / `Partial<Prefs>` | `Prefs` | 仅白名单字段 |
| `reveal_in_explorer` | `path` | `void` | 打开所在文件夹 |

**分级解码策略（防止内存失控）：**

- 画布显示：按"当前缩放 × 画布尺寸"计算所需最大边长，向 Rust 请求 **≤2 倍**显示尺寸的位图并缓存。
- 导出：按 `outW / docW` 比例，逐实例请求所需分辨率，由 `fast_image_resize` 做高质量重采样。
- 两级共用同一 `cover` 计算函数，杜绝"预览清晰、导出糊"或反之。

**错误模型**：Rust 侧统一返回 `{ code, message, hint }`，`code` 为枚举（如 `UNSUPPORTED_FORMAT`、`DECODE_FAILED`、`OUT_OF_MEMORY`、`WRITE_DENIED`），`message` 为中文可读文案，`hint` 为可执行建议。前端不拼接错误字符串。

---

## 7. 模板系统设计

模板不是图片，是**布局描述**：

```ts
interface TemplateDef {
  id: string;
  name: string;                    // 简体中文名称
  category: 'grid' | 'long' | 'columns' | 'asymmetric' | 'wall';
  cellCount: number;
  cells: Array<{ x: number; y: number; w: number; h: number }>; // 归一化 0..1
}
```

- 单元格用**归一化坐标**，切换画布尺寸时按比例自动重算，不需要为每个尺寸存一份。
- 间距 `gap` 在渲染时从单元格内缩，不写进模板数据（这样"统一间距"才能作用于自由布局与模板布局）。
- 模板切换按基线 §9.4 的九条语义实现，核心是**实例复用**而非"重新填充"：以 `libraryItemId` 匹配、`createdSeq` 取最早实例，其余移出画布但不删资源。
- 整个切换产生**一条**历史记录（快照型命令，见 §8）。

---

## 8. 撤销/重做设计

采用**混合模型**，不搞纯命令回放（模板切换这类跨多对象的操作回放极易不一致）：

| 操作类型 | 记录方式 | 理由 |
| --- | --- | --- |
| 高频交互（拖动、缩放、滑块） | 事务内合并为 1 条快照 | 避免每帧入栈；结束时一次性提交 |
| 结构变更（增删实例、图层排序、模板切换） | 完整 `DocumentState` 快照 | 保证"原子撤销"可完整还原 |
| 属性修改（裁剪、旋转、透明度、边框） | 快照 | 与结构变更同构，无需特例 |

- 快照使用结构共享（未变对象复用引用），50 实例下内存可忽略。
- 历史深度设上限（初值 100 步），超限丢最旧记录。
- 资源库操作（导入、释放、清空）**不进历史**，与画布编辑彻底分离（基线 §11.2）。
- 事务边界由交互层显式声明：`beginTransaction()` / `commit()`，`Esc` 触发 `abort()` 回滚到事务起点。

---

## 9. 迭代方向

### v1.0（基线范围，不做扩展）

按 `task.md` 的 P0~P12 推进，交付安装包 + 全量文档。

### v1.1 候选（需先改基线，不自动纳入）

| 方向 | 价值 | 前置条件 |
| --- | --- | --- |
| 自定义模板保存 | 复用高频排版 | 需要项目文件持久化，与"v1 不保存项目"冲突，须改基线 |
| 批量导出多套尺寸 | 效率提升 | 无冲突，可独立排期 |
| 上次导出设置记忆 | 减少重复操作 | 属偏好白名单，可提前做 |
| 画布尺寸预设（常用比例） | 降低设置成本 | 与"v1 不做社交尺寸预设"冲突，须确认 |

### 明确不做（与基线 §15 一致）

AI 处理、云端服务、文字排版、水印、HEIC 原生支持、任意角度旋转、插件系统、高级阴影、径向渐变、鼠标框选、快捷键自定义、项目保存/恢复、多语言与深色主题、首次启动引导。

### 架构演进预留

- `domain/commands` 采用"命令 + 归约"结构，未来若需要项目文件，可直接把命令序列化为操作日志。
- 渲染适配层隔离 Konva，若未来切换渲染引擎（如 WebGL）只改 `features/scene`。
- 不实现插件加载器（基线 §4.1 明确 v1 不做），仅保持模块边界清晰，不为"可能的插件"提前抽象。
