# 版本变更记录

本项目当前处于 v1 开发期，尚未发布。以下记录**工程里程碑**，不表示可用版本。

格式：日期 · 阶段 · 变更内容

---

## 2026-10-31 · 面板布局调整

**变更**

- 模板面板从**左栏**移到**右栏**：左栏固定为资源库，右栏变为「属性 / 图层 / 画布 / 模板」
- 理由：模板改变的是整体布局，与属性/图层/画布同属"对整个画布的操作"；资源库则是素材来源，两者心智不同层
- 左栏不再有标签页；`Ctrl+O` 只触发导入，不再需要切栏
- 偏好结构去掉 `leftTab`，`rightTab` 新增 `templates` 合法值（旧配置文件里残留的 `leftTab` 会被白名单忽略）

**验证**

- 前端用例 251 项通过（prefs 断言同步更新）
- typecheck / lint 0 错误

---

## 2026-10-31 · 反馈修复轮（导出阻断 + 交互 + 更名）

**修复**

- **导出报错 `Tainted canvases may not be exported`**：预览位图走 asset 协议加载，`asset.localhost` 与页面不同源，导致 canvas 被污染，`toBlob` 直接失败。导出改用新命令 `read_image_png`（Rust 解码 → EXIF 转正 → 按需缩放 → PNG 字节）配合 `blob:` URL 加载，同源不污染
- 导出分辨率同时修好：源图按「该图在输出中占多少像素」计算（上限 4096），不再固定 2048，大画布不再糊

**改进**

- 双击放入：画布已有内容时改为「缩到 70% + 斜向错开」（`cascadeFrame`），此前新图完全叠在旧图下面，看起来像双击没反应
- 新增资源库 → 画布拖拽放入：落点为模板空格则填入，压在已有图片上则替换，空白处按落点放置；拖拽浮标提示当前项
- 模板模式下实例被裁进所属单元格（`derive.cell` + 渲染层单元格容器 `clip`），超出格子的部分不再压到相邻格
- 更名 **In拼图**（窗口标题、关于面板、安装包名）；新增「关于」面板：作者 林间Inline（Everett Lineo）、版本、两个主页入口（Rust 侧固定白名单，不接受任意 URL）

**验证**

- 前端用例 247 → **251 项**（新增 cascadeFrame 4 项）；Rust 24 项
- typecheck / lint 0 错误

**未验证**

- 导出是否真的不再报污染、模板裁剪的视觉效果、拖拽手感 —— 均需人工点一次（KI-23 / KI-24）

---

## 2026-10-30 · P12 质量门禁与打包（进行中）

**新增**

- `src/__tests__/pipeline.test.ts`：跨模块端到端（导入 → 排序 → 模板 → 编辑 → 撤销/重做 → 导出计划），含资源释放与级联删除的集成断言
- `src/__tests__/offline.test.ts`：离线守卫 —— 源码不得出现 `fetch`/`XHR`/`WebSocket`、依赖不得含遥测 SDK、配置不得启用 updater。用 `?raw` 读源码，应用工程不引入 Node 全局
- 跨语言常量一致性断言：`domain/export.ts` 的 `MAX_RGBA_BYTES` 必须与 `commands/export.rs` 一致，漂移即测试失败
- `src-tauri` 两项 `#[ignore]` 压力测试：50 张 6MP 导入、2400×20000 导出
- `imaging` 抽出 `estimate_rgba_mb` / `is_risky` 纯函数并补边界用例
- `README.md` 重写：环境、开发、校验、构建打包、压力测试、数据位置
- `docs/RELEASE_CHECKLIST.md`：基线 §18.3 十项交付物逐项核对

**修复**

- 压力测试首版用纯渐变数据，PNG 编码 32 ms、输出 <1 MB（压缩比 200:1），属失真乐观值 → 改用「渐变 + 确定性噪声」，同一尺寸变为 545 ms / 133 MB

**验证**

- 前端用例 236 → **247 项**；Rust 24 → **24 项**（另 2 项 `#[ignore]`）
- T12.3：50 张 3000×2000 → 50/50 成功，1.29 s（25.8 ms/张），顺序解码峰值≈单张 24 MB
- T12.4：2400×20000 → 成功；PNG 链路 0.70 s、峰值 316 MB；JPEG 编码 3.04 s

**已知问题**

- KI-22：导出峰值内存约为缓冲上限的 2 倍（512 MB 上限只约束缓冲，不含编码输出）

---

## 2026-10-30 · P11 快捷键、退出与配置

**新增**

- `app/useAppShortcuts`：全项目唯一快捷键入口（Ctrl+Z/Y/Shift+Z、Ctrl+A、Ctrl+O、Ctrl+E、Delete、Esc 逐级退让）
- `app/useCloseGuard`：有未导出编辑时拦截窗口关闭并原生确认
- `state/prefsStore`：偏好白名单（导出格式/质量、画布尺寸、排序模式、面板标签页）、逐字段校验、400ms 防抖落盘
- `src-tauri/commands/prefs.rs`：`app_config_dir/prefs.json` 读写，临时文件 + rename
- `docs/SHORTCUTS.md`：快捷键总表与焦点优先级说明
- 面板标签与 `Ctrl+O` 的导入请求上移到 `viewStore`

**修复/清理**

- 删除 `useUndoShortcuts` 与 `useCanvasShortcuts`：两个监听器并存会让 Esc 优先级依赖注册顺序

**验证**

- 前端用例 226 → **236 项**（prefs 10）
- typecheck / lint 0 错误 0 警告

**未完成**

- G11 四条验收均待人工（KI-21）

---

## 2026-10-30 · P10 导出

**新增**

- `domain/export.ts`：`planStrips`（2048 行/条 + 1px 重叠）、`validateExportSize`（20,000 px 与 512MB 双限）、`defaultExportName`、`ensureExtension`、`transparencyNote`
- `features/export/renderStrips`：用 Konva 渲染单条带（复用 `deriveScene`/`syncBackground`/`syncLayer`）
- `features/export/exportFlow` + `state/exportStore`：逐条带编排、进度、取消、失败回滚
- `features/export/ExportDialog`：格式/质量/尺寸/路径/透明说明/溢出提示/进度/结果操作
- Rust `commands/export.rs`：缓冲分配、条带落位、PNG/JPEG 编码、`.tmp` + rename 原子落盘、`open_exported` / `reveal_exported` / `path_exists`
- 顶栏「导出」入口；T9.5 的导出期溢出提示随之完成

**关键设计**

- 渲染留在前端：与预览共用同一套几何，一致性是结构保证而非事后对齐（ADR-0008）
- 重活命令声明为 `async` + `spawn_blocking`，避免编码期间冻结窗口
- 重叠行只渲染不写入，防止每处接缝重复一行

**验证**

- 前端用例 209 → **226 项**；Rust 13 → **22 项**
- typecheck / lint 0 错误 0 警告

**未完成**

- T10.11 像素差分验收、JPEG 三档实测、元数据核验（KI-20）

---

## 2026-10-30 · P9 背景、边界与溢出

**新增**

- `domain/canvas.ts`：`contentBounds`、`isOverflowing`、`overflowingIds`、`overflowReport`（四向溢出量）、`normalizeAngle`、画布预设
- `features/canvas/CanvasPanel`：画布尺寸（含 4 个预设）、背景四选一（白/纯色/透明/渐变）、渐变起止色与角度、越界提示与「选中越界图片」
- 右栏改为「属性 / 图层 / 画布」三页
- 画布工具条显示越界张数

**关键设计**

- 越界只检测与提示，不自动修正（基线 §5.3）
- 棋盘格只在 `transparent` 时绘制，且不作为可选项（基线 §10.1）
- 背景、渐变参数、画布尺寸全部走 `commit`，均可撤销（T9.6）

**验证**

- 前端用例 198 → **209 项**（canvas 9 + store 2）
- typecheck / lint 0 错误 0 警告

**未完成**

- T9.5 的"导出前继续/返回"确认框依赖 T10.1 导出面板；G9 的两条导出侧验收随 P10 复核
- Fit to Content（T3.5 剩余）仍未做

---

## 2026-10-30 · P8 模板布局

**新增**

- `domain/templates.ts`：20 个模板（网格 6 / 长图 3 / 多列 4 / 不对称 4 / 照片墙 3），归一化坐标 + 按边取整；`applyTemplate` 实现基线 §9.4 九条语义
- `features/templates/TemplatePanel`：缩略图列表、适配模式（Fill/完整显示）、间距滑块、退出模板
- `features/templates/ImagePicker`：空白格填空与替换共用弹窗，替换走原生确认
- `app/LeftPanel`：左栏改为「资源库 / 模板」双页
- `domain/transform.ts`：`containCrop`（完整显示，不裁切）
- 空白单元格虚线占位 + 点击填空；`placeItem` 在模板模式下优先补第一个空格

**关键设计**

- 模板存归一化坐标：画布尺寸可改，写死像素会让模板全部失效
- 像素换算按边取整：位置与尺寸各自取整会出现 1px 缝
- 复用实例只改 `frame`，六个图像级属性原样保留
- 整个模板切换是一次 `commit` → 单步撤销（快照模型的直接收益）

**验证**

- 前端用例 154 → **198 项**（templates 43 + store 1）
- typecheck / lint 0 错误 0 警告

**未完成**

- 20 个模板的肉眼观感与交互实操（KI-18）；模板名单待用户确认（D-07）

---

## 2026-10-30 · P7 裁剪与图像属性

**新增**

- `domain/crop.ts`：`cropAspectFor`（锁定格子比例，旋转 90/270 取倒数）、`toNorm`/`toSource`、`moveCrop`、`resizeCrop`（八向，角点对角固定/边点中线固定）
- `features/crop/CropEditor`：独立浮层，展示完整源图 + 遮罩 + 八向控制点，`Esc`/点遮罩取消
- 属性面板：裁剪数值（源图像素）+ 还原全图；透明度滑块 + 数值；边框粗细/颜色；圆角半径
- `domain/transform.ts`：`toImageCrop` —— 源图像素裁剪 → 降采样位图坐标
- 渲染层：实例节点改为 `Group(Image + Border Rect)`，圆角用 `clipFunc`，边框画在内侧

**修复**

- C-001：渲染时把源图像素 crop 直接交给 2048px 预览位图，导致大图裁剪错位/空白（P3 起潜伏）

**验证**

- 前端用例 133 → **154 项**（crop 14 / transform +3 / 文档 +2 / store +2）
- typecheck / lint 0 错误 0 警告

**未完成**

- 裁剪拖动手感与圆角边框视觉的实操验证（KI-17）

---

## 2026-10-29 · P6 图层、对齐与吸附

**新增**

- `domain/align.ts`：`selectionBounds`、`alignInstances`（六向，基准为选中包围盒）、`distributeInstances`（边缘等距，首尾不动）、`displayIndexToArray`（图层显示序 ↔ 数组序）
- `domain/snap.ts`：`snapMove` —— 画布与图片的边/中线吸附，返回修正位移与辅助线段
- `features/layers/LayerPanel`：图层列表（顶层在上）、指针拖拽排序、可选中透明对象
- `features/layers/AlignBar`：多选编排条（六向对齐 / 横纵等距 / 批量删除），选中 ≥2 时出现、≥3 才可分布
- `app/RightPanel`：右栏「属性 / 图层」标签页；`ui/Thumbnail` 上移，资源库与图层共用
- `apply.ts`：`syncGuides` —— 覆盖层辅助线，`strokeScaleEnabled=false`，不进导出
- 拖动改为"起点 + 总位移"模型，`Alt` 临时关闭吸附（D-04）

**修复**

- D-005 右侧面板重复嵌套 `aside`（边框与内边距加倍）
- D-006 `.field` / `.field__label` / `.inspector__row` 等类名从未写样式，属性面板排版错乱
- D-007 点中已选对象会把多选塌缩为单选，导致"批量移动"实际不可用

**验证**

- 前端用例 105 → **133 项**（align 18 + snap 10）
- typecheck / lint 0 错误 0 警告

**未完成**

- 图层拖拽、吸附手感的实操验证（KI-16）

---

## 2026-10-29 · P5 控制点缩放

**新增**

- `domain/transform.ts`：`handlePoints`（八向控制点坐标）、`applyResize`（对边固定 + 最小尺寸）、`cursorForHandle`
- `apply.ts`：单选时绘制八个控制点，尺寸按 `zoom` 反向补偿（屏幕上恒为 7px）
- `KonvaStage`：控制点命中优先于实例命中；悬停给出缩放指针；缩放走 `mergeKey: "resize:<id>"`

**关键设计**

- 控制点坐标由 `handlePoints` 单点计算，绘制与命中判定共用——两处各算一遍必然出现"手柄画在这里、点击判在别处"
- 最小尺寸 8px 兜底：拖到反向时不会出现零面积，否则 `coverCrop` 会除零

**验证**

- 前端用例 95 → **105 项**（transform 10 → 20）
- typecheck / lint 0 错误 0 警告

---

## 2026-10-29 · P5 画布交互（拖动/选中/属性）

**新增**

- `domain/document.ts`：`hitTest`（顶层优先）、`filterAliveSelection`（清理失效选中）
- `KonvaStage` 交互：单击命中、Ctrl/Shift 多选、点空白取消选择、拖动移动、选中虚线框
- `useCanvasShortcuts`：`Delete` 删除选中实例（可撤销）、`Esc` 取消选择
- `InspectorPanel` + `ui/NumberField`：X/Y/W/H 数值编辑（Enter/失焦提交，Esc 回滚）
- 工具条显示选中数量

**关键实现**

- 拖动走 `mergeKey: "drag:<ids>"`，`pointerup` 调 `endMerge()` → 一次拖动只产生 1 个撤销步骤
- 事件回调与最新 doc/view 存入 `useRef`，避免闭包旧值导致"第二次拖动跳回旧位置"

**验证**

- 前端用例 90 → **95 项**
- typecheck / lint 0 错误（0 警告）；release 构建 4 分 08 秒，启动正常

**未完成**

- 控制点缩放（T5.4 剩余）、多选批量对齐（P6）
- 交互实操验证（KI-15）

---

## 2026-10-29 · P4 撤销/重做

**新增**

- `domain/history.ts`：快照式历史栈（入栈/撤销/重做/上限/标签）
- `docStore` 扩展：`past`/`future`、`commit(recipe, {label, mergeKey})`、`endMerge()`、`undo()`、`redo()`
- `app/useUndoShortcuts`：`Ctrl+Z` 撤销、`Ctrl+Y` / `Ctrl+Shift+Z` 重做，输入控件内不接管
- 标题栏撤销/重做按钮（禁用态 + "撤销：<操作名>" 提示）
- ADR-0003（画布数据模型）、ADR-0004（撤销快照模型与顺序前移）

**关键设计**

- 合并窗口 1200ms + `mergeKey`：连续拖动 50 帧只产生 **1 个**撤销步骤
- `commitNoHistory` 独立通道：资源释放改文档但不入栈（基线 §11.2）

**验证**

- 前端用例 65 → **90 项**（history 11 + docStore 14）
- typecheck / lint 0 错误；release 构建 3 分 33 秒，启动正常

**未测试**

- 快捷键与按钮的实际响应（KI-14）

---

## 2026-10-29 · P3 完成（画布性能基线）

**新增**

- 应用内渲染基准：`features/scene/bench.ts` + `BenchScreen`，由 `%TEMP%\pintu_bench.flag` 或 `PINTU_BENCH=1` 触发，跑完把 JSON 写入 `%TEMP%\pintu_canvas_bench.json` 后自动退出
- 画布工具条补百分比输入（回车/失焦应用，Esc 取消，5%~800%）

**实测数据**（50 实例 / 画布 2400×1600 / 视口 1440×836 / DPR 2）

| 缩放 | 管线每帧 p95 | 纯绘制 p95 | 60Hz 预算占用 |
| --- | --- | --- | --- |
| 适应画布 0.522× | **1.2 ms** | 0.6 ms | 7.2% |
| 100% | **1.1 ms** | 0.4 ms | 6.6% |

- 整体重建（销毁+重建 50 节点）：**2.5 ms**
- 三级数据流的间接开销约 0.4 ms／帧，占预算 2.4%

**关闭**

- KI-04（`batchDraw` 入队耗时不能推算 FPS）—— 已改用同步 `layer.draw()` 计时

**未测试**

- 导出光栅化（量级不同，不能外推）、真实照片纹理上传、裁剪/圆角叠加成本

---

## 2026-10-29 · P3 画布首次可见

**新增**

- `features/scene/`：`derive.ts`（状态→场景描述，纯函数）、`apply.ts`（唯一 Konva 适配器）、`KonvaStage.tsx`（舞台与交互）
- `features/canvas/`：`CanvasArea`（工具条 + 空状态）、`useSceneSources`（2048px 分级解码 + 缓存）、`placement`（单张/全部放入）
- `domain/transform.ts`：`coverCrop` / `frameCenter` / `alignFrame`
- `domain/layout.ts`：`centerFitFrame` / `gridFrames`（初始布局）
- `ui/ErrorBoundary`：画布渲染出错时局部降级，避免白屏

**能力**

- 背景：白色 / 透明（棋盘格提示）/ 纯色 / 线性渐变
- 超出画布边界的内容在视图中被裁切
- 滚轮锚点缩放、Space 平移、适应画布、100%、全部添加
- 双击资源库条目放入画布

**验证**

- 前端用例 46 → **65 项**全通过
- typecheck / lint 0 错误；release 构建 4 分 26 秒，启动正常

**未测试**

- 画布渲染的视觉效果（KI-13）、50 实例真实帧率（T3.7）

---

## 2026-10-29 · P2 完成（资源库闭环）

**新增**

- 拖放导入（原生 OS 拖放）
- 剪贴板导入（`arboard` 读图 → 临时 PNG → 同一导入流水线）
- 排序模式切换（自定义 / 文件名 / 导入时间）+ 指针拖拽排序
- 单个资源释放、清空资源库（均二次确认、级联移除画布实例）
- `docStore.commitNoHistory`：明确资源释放引起的文档变化不进入撤销历史

**验证**

- 前端用例 44 → **46 项**，Rust 13 项
- typecheck / lint 0 错误
- release 构建 5 分 09 秒，启动正常

**架构决策**

- D-004：Windows 上原生文件拖放会屏蔽 HTML5 拖拽，故列表排序改用指针事件实现

**未完成 / 待人工验证**

- 三入口与释放/清空的实操验证（KI-12）
- 排序模式记忆（依赖 T11.4 偏好持久化）

---

## 2026-10-29 · P2 导入链路

**新增**

- Rust `imaging` 模块：内容嗅探 + 完整解码两段校验、EXIF 方向应用、HEIC 按 `ftyp` brand 识别、单文件失败隔离
- `probe_files` 命令（运行在阻塞线程池，避免占用异步运行时）
- 前端 `features/library/`：导入编排（判重询问、大图预警）与资源库面板
- 依赖：`tauri-plugin-dialog` 2.8.4（含 `rfd` 0.17）

**验证**

- Rust 用例 2 → **10 项**，覆盖截断文件、HEIC 签名、HEIC 改名成 .jpg、批量失败隔离、EXIF 方向映射
- 前端 44 项用例未回退，typecheck/lint 0 错误
- release 构建 2 分 43 秒，启动正常

**修复 / 收敛**

- `LibraryItem` 补 `fileSize` 字段（此前列表无法显示文件大小）
- 大图风险阈值由前后端各一份收归 Rust 单点（`meta.risky`），消除阈值不同步隐患

**未完成**

- 拖放导入、剪贴板导入（T2.2 / T2.3）
- 资源库缩略图与大图预览（T2.7 续）

---

## 2026-10-27 · P0 环境与可行性验证

**新增**

- `docs/OPEN_SOURCE_SURVEY.md`：11 个开源候选的实测调研（star / issues / 许可证 / 活跃度）
- `docs/adr/ADR-0001-base-selection.md`：组合式基座决策（已接受）
- `docs/adr/ADR-0002-license.md`：自有代码采用 MIT
- `docs/ARCHITECTURE.md`：四层架构、四类数据模型、变换管线、条带化导出
- `docs/COMPATIBILITY.md`、`docs/TEST_REPORT.md`、`docs/KNOWN_ISSUES.md`
- `docs/REQUIREMENTS.md`、`docs/TASKS.md`、`README.md`
- `LICENSE`（MIT，© 2026 Everett Lineo）、`THIRD_PARTY_NOTICES.md`

**验证结论**

- Tauri 2 + React + TS 可构建、可打包：exe + MSI(2.04 MiB) + NSIS(1.39 MiB)，release 构建 4 分 07 秒
- 图像解码：PNG / JPEG / WebP / BMP 全部通过；HEIC 与截断文件被明确拒绝且不崩溃；EXIF Orientation 可读
- Konva 装配：真实 WebView2 中 50 实例、4/4 正确性断言通过、派生 0.01 ms、帧间隔 17.3 ms（57.8 fps）
- 依赖裁剪：`image` 仅启四格式后，依赖 126→34，构建 60s→21.76s

**决策**

- 不 fork 任何现成拼图应用（理由见 ADR-0001 §2）
- 导出上限实测不达标即直接下调（用户决定）
- 撤销基座由基线第 9 步前置至 P4（待写 ADR-0004）

---

## 版本号约定

- 应用版本从 `0.1.0` 起（P1 骨架阶段）
- `1.0.0` 对应基线 v1.16 的验收通过版本
- 本文件在每次发布时追加"发布"小节，包含：版本号、变更摘要、已知问题引用、测试报告引用
