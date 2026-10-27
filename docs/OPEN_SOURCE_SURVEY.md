# 开源可复用基座调研报告

- 调研时间：2026-10-27
- 调研对象：可用于「Windows 本地图片拼接工具」的开源项目与库
- 数据来源：GitHub REST API 实时查询（star / open issues / license / pushed_at），许可证以仓库 LICENSE 原件核实
- 结论去向：`docs/adr/ADR-0001-base-selection.md`

> 说明：本报告只记录可核验的事实。凡未通过 API 采集的字段一律标注 `未采集`，不做估算填充。

---

## 1. 调研方法

分三层筛选，逐层收敛：

| 层级 | 问题 | 判据 |
| --- | --- | --- |
| L1 整体应用层 | 有没有可以直接 fork 的拼图/图片编辑桌面应用？ | 功能覆盖度、桌面端形态、许可证、活跃度 |
| L2 编辑器内核层 | 画布对象模型、交互、变换、图层，能否复用现成引擎？ | 是否 MIT/Apache、是否支持裁剪/变换/图层、维护状况 |
| L3 图像处理层 | 解码、缩放、EXIF、编码能否完全交给 Rust 生态？ | 格式覆盖、许可证、性能、维护状况 |

---

## 2. L1：整体应用层候选（拟作为 fork 基座）

| 项目 | 技术形态 | ★ | 许可证 | 最近 push | 判定 |
| --- | --- | --- | --- | --- | --- |
| `hangtianxia/chututu` | Electron 24 + Svelte 4 + Sharp + FFmpeg | 未采集 | MIT（README 声明，基于 `ggchivalrous/yiyin` 修改） | 2026-01-30 | ✗ 不适配 |
| `chern-kp/QuickImageMerge` | C++ / Qt | 未采集 | MIT | 2025-08 | ✗ 不适配 |
| `stefano-lev/py-image-stitcher` | Python / PyQt5 / Pillow | 0 | MIT | 2026-05 | ✗ 不适配 |
| `FastMirror-MC/image-stitcher` | 纯 Web（React 19 + Vite），无桌面壳 | 未采集 | MIT | 未采集 | ✗ 不适配 |

### 判定理由（逐项）

**chututu / QuickImageMerge / py-image-stitcher / image-stitcher —— 全部否决，原因一致：**

1. **功能模型不匹配。** 这四个项目的能力边界是「多图纵向/横向/网格拼接 + 间距/边框/背景色」。基线要求的是**自由画布 + 实例级变换（裁剪/旋转/翻转/透明度/圆角）+ 约 20 个模板 + 图层顺序 + 撤销重做**。缺的不是一个功能，而是整个「画布文档模型 + 命令历史」层。
2. **复用等于重写。** 若 fork 它们，画布层、图层层、撤销层、模板层全部要新建并挤进别人的目录结构里，同时背上其历史包袱（Svelte/Electron/Qt/PyQt 各一套技术栈）。净收益为负。
3. **技术栈冲突。** `chututu` 是 Electron + Svelte，与本项目已验证的 Tauri 2 + React 冲突；`QuickImageMerge` 是 Qt C++，等于放弃整个前端生态；`py-image-stitcher` 需捆绑 Python 运行时。
4. **规模不可信。** `py-image-stitcher` 0 star、6 次提交；`image-stitcher` 是练习级单页应用。作为基座意味着长期自己维护一个没有社区的项目。

> 结论：**L1 层面不存在值得 fork 的基座。** 这不是"没找到"，而是这类工具的产品形态决定了开源实现普遍停在"能拼一张图"，而本项目的难点恰在其之外。

---

## 3. L2：编辑器内核层候选

| 项目 | 定位 | ★ | open issues | 许可证 | 最近 push | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| `konvajs/konva` | Canvas 场景图框架（图层、拖拽、变换、导出） | 14,904 | 2 | **MIT** | 2026-10-23 | ✓ 选用 |
| `fabricjs/fabric.js` | Canvas 对象模型 + SVG 解析 | 31,522 | 460 | **MIT** | 2026-10-26 | ○ 备选 |
| `excalidraw/excalidraw` | 手绘白板编辑器（完整应用） | 134,621 | 3,420 | **MIT** | 2026-10-26 | ○ 交互参考 |
| `viliusle/miniPaint` | Web 版 Photoshop（图层 + 历史） | 3,484 | 49 | 未识别（API 返回 NOASSERTION） | 2026-04-20 | ○ 交互参考 |

### 3.1 Konva（选用）

**适配度最高的三个硬指标：**

1. `Konva.Image` **原生支持 `crop` 属性**（`{x, y, width, height}`，源像素坐标，非破坏性）。这与基线 §8.4「裁剪是非破坏性操作，原始像素保留」是同一语义，不需要自己发明裁剪模型。
2. `Transformer` 提供缩放控制点；`rotateEnabled` 可关闭、`rotationSnaps` 可限定 90° 步进，正好对齐基线 §8.3「v1 不要求任意角度旋转」。
3. `Layer` / `zIndex` 与图层列表的堆叠语义一一对应（基线 §8.6）。

**活跃度**：14,904 star，仅 **2 个 open issue**，3 天内仍有提交 —— 在 15k 量级项目里属于响应极快的一档。

**许可证注意点**：GitHub API 返回的 `license.spdx_id` 是 `NOASSERTION`，仅看 API 会误判为"许可证不明"。已拉取仓库 `LICENSE` 原件核实：**MIT License**，含 KineticJS（Eric Rowell）与 Konva（Anton Lavrenov）两段版权声明。引入时需在第三方声明中同时保留这两条。

### 3.2 Fabric.js（备选，未选）

31,522 star，MIT，功能更重（对象模型、分组、SVG 双向解析、滤镜）。

未选原因：**460 个 open issue** 且 bundle 更大；其对象模型/事件体系更"自成一体"，我们只需要场景图 + 变换，不需要 SVG 解析与滤镜栈。Konva 的原生 `crop` 已直接命中核心需求，集成面更小。

> 保留为备选：若后续需要 SVG 导入或复杂滤镜，Fabric 是明确的替代路径，切换成本集中在渲染适配层（见 ARCHITECTURE.md 的分层设计），可控。

### 3.3 Excalidraw / miniPaint（仅作交互参考，不引入代码）

- Excalidraw：134,621 star、MIT，是**交互范式**的最佳参考样本（多选、框选、吸附对齐线、撤销粒度、Esc 语义）。但它是一个 100MB+ 量级的白板应用，领域是"手绘图形"而非"位图排版"，fork 进来要剥离的东西比新建还多。
- miniPaint：3,484 star，AGPL/MIT 未识别（API `NOASSERTION`，未核验原件），最近提交 2026-04-20（约 6 个月前）。**许可证未确认前不得引入任何代码**；仅阅读其图层与历史栈的交互设计。

---

## 4. L3：Rust 图像处理层

| 项目 | 能力 | ★ | 许可证 | 最近 push | 判定 |
| --- | --- | --- | --- | --- | --- |
| `image-rs/image` | 解码/编码 PNG、JPEG、WebP、BMP | 5,897 | Apache-2.0 | 2026-09-15 | ✓ 选用 |
| `Cykooz/fast_image_resize` | SIMD 高质量重采样 | 465 | Apache-2.0 | 2026-10-25 | ✓ 选用 |
| `kamadak/exif-rs` | EXIF 解析（含 Orientation） | 259 | BSD-2-Clause | 2025-10-21 | ✓ 选用 |

**说明：**

- `image` 覆盖基线 §6.1 要求的全部四种格式，且不含 HEIC —— 与基线「v1 不支持 HEIC」天然一致，无需额外屏蔽逻辑，只需在错误分支给出明确提示。
- `fast_image_resize` 用于「显示分辨率 vs 导出分辨率」的分级解码（见 ARCHITECTURE.md §5），避免把 20,000 px 全量像素压进前端。
- `exif-rs` 最近提交为 2025-10-21（约 1 年前），属**低活跃但稳定**类库：EXIF 规范本身多年未变，功能面窄，风险可接受。若后续出现解析异常，备选为 `image` 自带的方向处理 + 自行解析 APP1 段。

---

## 5. 许可证合规判定

| 许可证 | 涉及组件 | 义务 | 对本项目的影响 |
| --- | --- | --- | --- |
| MIT | Konva、Tauri、React、Zustand | 保留版权声明与许可文本 | 可闭源分发，需在"关于/第三方许可"页列明 |
| Apache-2.0 | `image`、`fast_image_resize`、Tauri 部分 | 保留声明、NOTICE、专利授权条款 | 可闭源分发，需附 NOTICE |
| BSD-2-Clause | `exif-rs` | 保留版权声明 | 可闭源分发 |

**结论：全部为宽松型（permissive）许可证，无 GPL/AGPL/LGPL 传染性组件，商业闭源分发成立。**

**若最终选择开源分发**，则上述结论不变，仅是额外增加自有代码的许可证选择问题（建议 MIT 或 Apache-2.0）。

**风险提示**：`viliusle/miniPaint` 许可证未核验，**禁止引入其代码**；仅可作为交互设计参考（阅读不构成复制）。如后续确需引用，必须先取得其 LICENSE 原件并做法务确认。

---

## 6. 汇总评分（1~5 分，5 最优）

权重：功能适配 40%、许可风险 20%、活跃度 20%、集成成本 20%

| 候选 | 功能适配 | 许可 | 活跃度 | 集成成本 | 加权 |
| --- | --- | --- | --- | --- | --- |
| **Konva** | 5 | 5 | 5 | 4 | **4.8** |
| Fabric.js | 4 | 5 | 4 | 3 | 4.0 |
| Excalidraw（作基座） | 2 | 5 | 3 | 1 | 2.6 |
| chututu（作基座） | 1 | 4 | 2 | 2 | 1.9 |
| 从零自研画布 | 5 | 5 | — | 1 | 3.4 |

> 「从零自研画布」得 3.4 分：功能可控但集成成本极高。**选 Konva 的核心收益就是把这部分成本换成 4.8 分的现成引擎**，同时保留自有文档模型（不被 Konva 绑架，见 ADR-0001 决策二）。

---

## 7. 局限性声明

1. `chututu`、`QuickImageMerge`、`image-stitcher` 的 star 数与提交活跃度来自搜索引擎快照与镜像站（ghub.com 等第三方抓取站），**未通过 GitHub API 复核**。因其已全部否决，未追加核验成本；若后续重新考虑，须以官方仓库数据为准。
2. 本次未穷举 GitHub 全量拼图类项目，覆盖的是搜索结果前列与主流画布引擎。若后续发现遗漏候选，按 ADR-0001 的评估维度补评，不推翻已有结论。
3. 各库的**具体版本号未在本报告锁定**，将在 T1.1 装配时按 `package.json` / `Cargo.toml` 实际解析结果补录到 `docs/COMPATIBILITY.md`。
