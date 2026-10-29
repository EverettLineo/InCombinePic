# 版本变更记录

本项目当前处于 v1 开发期，尚未发布。以下记录**工程里程碑**，不表示可用版本。

格式：日期 · 阶段 · 变更内容

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
