<p align="center">
  <img src="In拼图·何罗鱼icon.png" alt="In拼图·何罗鱼" width="112">
</p>

<h1 align="center">In拼图 · 何罗鱼</h1>

<p align="center">Windows 本地图片拼接工具 · 模板布局与自由画布 · 全部处理在本机完成</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-0.2.0-3976E8?style=flat-square">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-202B40?style=flat-square">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows-202B40?style=flat-square">
  <img alt="tests" src="https://img.shields.io/badge/tests-263%20%E5%89%8D%E7%AB%AF%20%2B%2027%20Rust-2E9E6B?style=flat-square">
</p>

---

## 它是什么

把多张图片拼成一张成图：导入 → 选模板或自由排版 → 调整 → 导出 PNG / JPEG。

- **给谁用**：需要在 Windows 上快速出图、又不愿把工作图片上传到在线拼图网站的人。
- **解决什么**：模板化排版（九宫格、长图、照片墙）、像素级位置控制、可撤销的非破坏性编辑、可控的导出尺寸与格式。
- **不是什么**：不是图像编辑器。没有文字、贴纸、滤镜、液化，也不做批量处理与图库管理。

**全部处理在本地完成，应用运行期不发起任何网络请求。** 这条约束由 `src/__tests__/offline.test.ts` 做可执行断言：源码中出现 `fetch` / `XHR` / `WebSocket`、依赖中混入遥测 SDK、配置中启用 updater，测试即失败。

名称取自《山海经·北山经》的何罗鱼——「一首而十身」，一个身子十个头，正如一个画布容纳多张图。关于面板里有原文、释义与版本差异说明，正文不展开。

## 核心能力

| 模块 | 能力 |
| --- | --- |
| 导入 | 文件对话框、拖放到窗口、剪贴板粘贴三条入口；PNG / JPEG / WebP / BMP；内容嗅探 + 完整解码两段校验；EXIF 方向自动校正；重复导入询问；超大图预警 |
| 资源库 | 缩略图列表、三种排序（自定义 / 文件名 / 导入时间）、指针拖拽排序、单条释放与清空（级联移除画布实例，可确认） |
| 画布 | 滚轮锚点缩放（5%~800%）、空格平移、适应画布、100%、八向控制点缩放、拖拽与多选；背景四选一（白 / 纯色 / 透明棋盘格 / 线性渐变）；越界只提示不自动修正 |
| 排版 | 20 个内置模板（网格 6 / 多列 4 / 长图 3 / 不对称 4 / 照片墙 3）；模板存归一化坐标，改画布尺寸不失效；空槽位标注填充序号，双击资源库图片按序号依次填入；资源库可拖到画布——落空槽填空、压在图上替换、空白处自由放置 |
| 图像属性 | 非破坏性裁剪（以源图像素记录，可还原全图）、透明度、边框粗细与颜色、圆角半径 |
| 图层与对齐 | 图层列表（顶层在上、可拖拽排序）、Ctrl/Shift 多选、六向对齐、横纵等距分布、批量删除、画布边与中线智能吸附（`Alt` 临时关闭） |
| 导出 | PNG / JPEG（可调质量）；条带化渲染 + Rust 侧拼接编码，内存不随画布高度线性膨胀；进度、取消、失败回滚；`.tmp` + rename 原子落盘 |
| 可靠性 | 快照式撤销/重做（上限 100 步，拖动/缩放合并为一步）、退出前未导出提醒、偏好持久化、画布渲染出错局部降级不白屏 |
| 体验 | 一键「性能优先」开关（交互动画、装饰性阴影默认关闭）；关于面板集中放置版本、作者与隐私说明 |

## 一次典型的工作流

1. `Ctrl+O` 导入，或直接把图片拖进窗口、`Ctrl+V` 粘贴剪贴板截图。
2. 右栏「模板」选一个版式——图片按序落格，空槽位显示 1、2、3。
3. 继续双击资源库图片，图片自动填进下一个空槽；或拖到画布上指定位置。
4. 选中图片调位置、裁剪、圆角、边框；多选后对齐或等距分布。
5. `Ctrl+E` 导出，选尺寸、格式、保存路径。

快捷键与焦点优先级见 [`docs/SHORTCUTS.md`](./docs/SHORTCUTS.md)。

## 安装

> **0.2.0 是候选版本，尚未正式发布**，仓库暂不提供二进制下载。安装包需自行构建（见「构建与打包」）。
>
> 发布前的阻断项（人工验收、安装/卸载验证）记录在 [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md)，请以该文件为准判断当前是否可发布。

构建产物为 NSIS 安装包，双击安装，装完从开始菜单启动。安装与卸载只写安装目录、`%APPDATA%\com.everettlineo.pintu`（偏好）与 `%LOCALAPPDATA%\com.everettlineo.pintu`（缩略图缓存），不触碰用户图片目录。

### 分发渠道

| 渠道 | 内容 | 用途 |
| --- | --- | --- |
| GitHub Releases | `In拼图·何罗鱼_0.2.0_x64-setup.exe` | 终端用户安装 |
| GitHub Packages（npm） | 源码包 `@everettlineo/pintu` | 内部复用与审计，**不含可执行文件，不能直接运行** |

npm 渠道的认证、发布与安装步骤见 [`docs/PUBLISHING.md`](./docs/PUBLISHING.md)。

## 环境要求

| 依赖 | 版本（实测通过） |
| --- | --- |
| Windows | 11（`10.0.26300` x64）；Windows 10 未实测 |
| Rust | 1.99.1，`x86_64-pc-windows-msvc` |
| Node.js | 22.x |
| WebView2 Runtime | 随系统安装（实测 155.x） |
| MSVC 生成工具 | 可用（支持非默认安装路径） |

## 开发

```bash
npm ci                     # 按 package-lock.json 安装（首次）
npm run tauri dev          # 开发窗口，前端热更新
```

只调界面时可以 `npm run dev` 起纯前端（`http://localhost:1420`），但涉及 IPC 的功能需要真实窗口。

## 质量门禁

提交前应全绿：

```bash
npm run typecheck              # tsc --noEmit
npm run lint                   # ESLint，含三条架构边界规则
npm test                       # Vitest，17 个文件 / 263 项
cd src-tauri && cargo test      # Rust，27 项（另 2 项 #[ignore] 压测）
```

当前基线：**前端 263 项通过、Rust 27 项通过、typecheck 与 lint 0 错误 0 警告。**

三条架构边界由 ESLint 强制，越界直接报错：

| 边界 | 规则 | 目的 |
| --- | --- | --- |
| `src/domain/` | 纯 TypeScript，禁止 React / Konva / IPC | 几何、文档、导出等核心逻辑可脱离框架单测 |
| `src/features/scene/` 之外 | 禁止 import `konva` | Konva 只经过一个适配层，节点树与状态树不互相污染 |
| `src/platform/` 之外 | 禁止 import `@tauri-apps/*` | IPC 只有一个出口，便于测试与替换 |

## 构建与打包

```bash
npm run build                     # 仅前端
npm run tauri build               # 前端 + Rust + NSIS 安装包
npm run tauri build --no-bundle   # 只出可执行文件
```

| 产物 | 路径 | 体积（0.2.0 实测） |
| --- | --- | --- |
| 可执行文件 | `src-tauri/target/release/pintu.exe` | 7.55 MiB |
| 安装包 | `src-tauri/target/release/bundle/nsis/In拼图·何罗鱼_0.2.0_x64-setup.exe` | 2.28 MiB |

> 首次打包需联网下载 NSIS 工具链；**应用运行本身完全离线**。

## 性能（开发机实测）

| 场景 | 结果 |
| --- | --- |
| 画布渲染，50 实例，视口 1440×836 / DPR 2 | 每帧管线 p95 **1.2 ms**（适应画布）/ **1.1 ms**（100%），约占 60 Hz 预算 7% |
| 整层重建（销毁 + 重建 50 节点） | 2.5 ms |
| 导入 50 张 3000×2000 | 50/50 成功，**1.29 s**（25.8 ms/张） |
| 导出 2400×20000 PNG | **0.70 s**，峰值内存 **316 MB** |
| 导出 2400×20000 JPEG | 编码 3.04 s |

数字来自一台开发机，用于判断量级与回归对比，不代表所有机型的绝对值。复跑方式：

```bash
cd src-tauri
cargo test --release -- --ignored --nocapture stress          # 50 张 6MP 导入
cargo test --release -- --ignored --nocapture twenty_thousand # 2400×20000 导出
```

必须加 `--release`：debug 构建的图像编解码慢一个数量级，据此外推容量会得出错误结论。

## 数据与隐私

| 内容 | 位置 |
| --- | --- |
| 偏好设置 | `%APPDATA%\com.everettlineo.pintu\prefs.json`（仅 8 个白名单字段，逐字段校验，非法值回落默认） |
| 缩略图缓存 | `%LOCALAPPDATA%\com.everettlineo.pintu\thumbnails\` |
| 导出文件 | 每次导出时由用户指定 |

文档内容（图片引用、实例、撤销历史）**不落盘**，每次启动都是空画布——这是刻意设计，不是缺陷：没有「保存/打开工程」就意味着不存在半损坏的工程文件和版本兼容问题。

卸载不删除用户导出的图片。界面上关于隐私与离线的说明只出现在**关于**面板一处。

## 技术栈与架构

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2（Rust 1.99 / WebView2） |
| 前端 | React 19 + TypeScript 6 + Vite 8 + Zustand 5 |
| 画布 | Konva 10（仅 `features/scene` 直接引用） |
| 图像处理 | Rust：`image`（四种格式）/ `fast_image_resize` / `kamadak-exif` / `arboard` |
| 测试 | Vitest（前端）+ `cargo test`（Rust） |

```
src/
├── app/         外壳、左右面板、快捷键、退出保护
├── features/    library canvas scene inspector layers templates crop export about settings
├── state/       docStore（唯一写入口 + 快照撤销）/ viewStore / libraryStore / prefsStore / exportStore
├── domain/      纯 TS：几何、文档、变换、布局、历史、模板、对齐、吸附、裁剪、导出计划
├── platform/    ipc.ts —— 唯一的 IPC 出口
└── ui/          ErrorBoundary / NumberField / Thumbnail
```

三级数据流：`DocumentState` →（纯函数 `deriveScene`）→ `syncLayer`（唯一 Konva 适配器）→ 节点树。导出的条带渲染复用同一套几何，前后端一致性是结构保证，不是事后对齐。

设计取舍见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) 与 [`docs/adr/`](./docs/adr/)（8 份 ADR）。

## 已知限制

- **仅 Windows**：0.2.0 只验证了 Windows 10.0.26300 x64。
- **不支持 HEIC / HEIF**：会明确报错而非静默失败（需求基线 §6.1）。
- **导出上限**：单边 ≤ 20 000 px，RGBA 缓冲 ≤ 512 MB；超限时给出可读的原因与建议尺寸，而不是崩溃。
- **无自动保存、无多文档**；撤销历史上限 100 步，关闭窗口即清空。
- **模板固定 20 个**，暂不支持保存自定义模板。
- **部分视觉与手感项仍需人工验收**，逐条列在 [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) 中标注「影响发布：是」的条目。

## 项目状态

| 项 | 状态 |
| --- | --- |
| 功能范围 | 导入 / 资源库 / 画布 / 裁剪与图像属性 / 图层与对齐吸附 / 20 个模板 / 背景与溢出 / 导出 / 快捷键与偏好 / 设置 / 关于 —— 全部实现 |
| 自动化 | 前端 263 项、Rust 27 项（+2 项 `#[ignore]` 压测）通过；typecheck / lint 0 错误 0 警告 |
| 构建 | `pintu.exe` 7.55 MiB、NSIS 安装包 2.27 MiB 已产出 |
| 发布阻断项 | 人工走查（画布/撤销/图层/裁剪/模板/导出/快捷键）、安装与卸载残留验证 —— 见 [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md) |

进度以 [`task.md`](./task.md) 为唯一真源。

## 文档索引

| 文件 | 内容 |
| --- | --- |
| [`task.md`](./task.md) | 任务真源、门禁与阶段结论 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 分层、数据模型、变换与导出管线 |
| [`docs/adr/`](./docs/adr/) | 8 份架构决策记录（基座、许可、数据模型、撤销、对齐吸附、裁剪、模板、导出） |
| [`docs/SHORTCUTS.md`](./docs/SHORTCUTS.md) | 快捷键总表与焦点优先级 |
| [`docs/COMPATIBILITY.md`](./docs/COMPATIBILITY.md) | 兼容性矩阵（严格区分实测 / 未测） |
| [`docs/TEST_REPORT.md`](./docs/TEST_REPORT.md) | 测试结果（通过 / 失败 / 未测试） |
| [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) | 已知问题、规避方式与是否阻断发布 |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | 版本变更记录 |
| [`docs/RELEASE_NOTES_v0.2.0.md`](./docs/RELEASE_NOTES_v0.2.0.md) | 0.2.0 发行说明 |
| [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md) | 发布交付物核对 |
| [`docs/PUBLISHING.md`](./docs/PUBLISHING.md) | 用 GitHub Packages 分发 npm 包 |
| [`docs/NEXT_VERSION.md`](./docs/NEXT_VERSION.md) | 下一版本功能提案 |
| [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) | 第三方组件与许可证 |
| [`NOTICE.md`](./NOTICE.md) | 版权与许可范围（含品牌资产说明） |

## 常见问题

**为什么打开是空白画布？** 有意为之。文档不落盘，不提供"保存工程"，避免出现版本不兼容的工程文件；导出的是最终图片，不是可再编辑的工程。

**为什么导出提示尺寸超限？** 单边超过 20 000 px 或像素缓冲超过 512 MB 会被拒绝。这是把"内存不足导致崩溃"提前成"可读的提示"，而不是放任 OOM。

**会联网吗？** 不会。除用户主动点击「关于」里的作者主页（交给系统浏览器打开）外，应用不做任何网络请求，且有测试守着这条约束。

## 许可证

- **自有代码**：MIT，见 [`LICENSE`](./LICENSE)。© 2026 Everett Lineo。
- **品牌资产**：名称「In拼图·何罗鱼」、图标、五色品牌带与《山海经》释义文案不在 MIT 授权范围内，详见 [`NOTICE.md`](./NOTICE.md)。
- **第三方组件**：均为宽松型许可（MIT / Apache-2.0 / BSD / ISC / Zlib / Unicode-3.0），另含少量 MPL-2.0 依赖（文件级弱著佐权，不影响本项目源码）。逐项版本与义务见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

---

作者：林间Inline（Everett Lineo）
仓库：<https://github.com/EverettLineo/InCombinePic>
主页：<https://github.com/EverettLineo> · <https://everettlineo.github.io/> · <everettlineo@gmail.com>
