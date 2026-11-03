# In拼图·何罗鱼

面向 Windows 的本地图片拼接工具：导入多张图片 → 模板布局或自由画布排版 → 导出 PNG / JPG。

属于「山海经神兽」工具集，取名自《山海经·北山经》的何罗鱼——「一首而十身」，正如一个画布容纳多张图。

**全部处理在本地完成，不上传任何图片或编辑数据。** 应用运行期无任何网络请求（`src/__tests__/offline.test.ts` 会对此做可执行断言）。

作者：林间Inline（Everett Lineo）· <https://github.com/EverettLineo> · <https://everettlineo.github.io/>

## 当前状态

v0.2.0：功能开发完毕，完成品牌化与性能收口。

| 项 | 状态 |
| --- | --- |
| 功能范围 | 导入 / 资源库 / 画布编辑 / 裁剪与图像属性 / 图层与对齐吸附 / 20 个模板 / 背景与溢出 / 导出 / 快捷键与配置 / 设置 / 关于 |
| 自动化用例 | 前端 263 项、Rust 27 项（另含 2 项 `#[ignore]` 压力测试） |
| 待人工验收 | 见 [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) 中标注「影响发布：是」的条目 |

作者：林间Inline（Everett Lineo）· <https://github.com/EverettLineo> · <https://everettlineo.github.io/>

进度以 [`task.md`](./task.md) 为唯一真源。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite |
| 画布引擎 | Konva（MIT） |
| 图像处理 | Rust：`image` / `fast_image_resize` / `exif-rs` / `arboard` |

架构与分层规则见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)，关键取舍见 [`docs/adr/`](./docs/adr/)。

## 环境要求（已实测）

| 依赖 | 版本 |
| --- | --- |
| Windows | 11（已验证 10.0.26300 x64） |
| Rust | 1.99.1（`x86_64-pc-windows-msvc`） |
| Node.js | 22.x |
| WebView2 Runtime | 随系统安装（155.x） |
| MSVC 生成工具 | 可用（支持非默认安装路径） |

## 开发

```bash
npm install              # 首次
npm run tauri dev        # 启动开发窗口（前端热更新）
```

## 校验（提交前应全绿）

```bash
npm run typecheck             # tsc --noEmit
npm run lint                  # 含三条架构边界规则
npm test                      # 前端用例（vitest）
cd src-tauri && cargo test     # Rust 用例
```

三条架构边界由 ESLint 强制执行，越界即报错：

| 边界 | 规则 |
| --- | --- |
| `domain/` | 纯 TypeScript，禁止 React / Konva / IPC |
| `features/scene/` 之外 | 禁止 import Konva |
| `platform/` 之外 | 禁止 import `@tauri-apps/*` |

## 构建与打包

```bash
npm run build                    # 只构建前端
npm run tauri build              # 构建 + 打包 NSIS 安装包
npm run tauri build --no-bundle  # 只出可执行文件（调试用）
```

产物：

| 文件 | 说明 |
| --- | --- |
| `src-tauri/target/release/pintu.exe` | 可执行文件 |
| `src-tauri/target/release/bundle/nsis/*-setup.exe` | 安装包 |

> 首次 `tauri build` 会下载 NSIS 工具链，**构建机需联网**；应用运行本身完全离线。

## 性能开关

默认按「性能优先」配置，面向老旧政务台式机：

| 设置项 | 默认 | 作用 |
| --- | --- | --- |
| 交互动画 | 关 | 按钮反馈、弹窗入场、面板切换的过渡；关闭后立即响应 |
| 装饰性阴影与半透明 | 关 | 弹窗投影等合成开销 |

两项都不影响导出结果与画质，画布渲染与导出始终按完整质量执行。系统若启用「减少动效」，应用内即使开启也会被强制关闭。

## 压力测试（默认不跑）

```bash
cd src-tauri
cargo test --release -- --ignored --nocapture stress          # T12.3 50 张 6MP 导入
cargo test --release -- --ignored --nocapture twenty_thousand # T12.4 2400×20000 导出
```

必须用 `--release`：debug 构建的图像编解码慢一个数量级，据此外推容量会得出错误结论。

## 数据存放位置

| 内容 | 位置 |
| --- | --- |
| 偏好设置 | `%APPDATA%\com.everettlineo.pintu\prefs.json`（仅 7 个白名单字段） |
| 缩略图缓存 | `%LOCALAPPDATA%\com.everettlineo.pintu\thumbnails\` |
| 导出文件 | 用户每次导出时自行选择的路径 |

界面上的「隐私与离线」说明集中在**关于**面板，不散落在各处。

卸载不会删除用户的导出文件。文档内容（图片、实例、撤销历史）**不落盘**，启动永远是空画布——这是刻意设计，不是缺陷。

## 文档索引

| 文件 | 内容 |
| --- | --- |
| [`task.md`](./task.md) | 任务真源、门禁、下一步 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 分层、数据模型、变换管线 |
| [`docs/SHORTCUTS.md`](./docs/SHORTCUTS.md) | 快捷键总表与焦点优先级 |
| [`docs/COMPATIBILITY.md`](./docs/COMPATIBILITY.md) | 兼容性矩阵（区分实测 / 未测） |
| [`docs/TEST_REPORT.md`](./docs/TEST_REPORT.md) | 测试结果（通过 / 失败 / 未测试） |
| [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) | 已知问题与规避 |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | 版本变更 |
| [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) | 第三方许可 |

## 许可证

自有代码：[MIT](./LICENSE) © 2026 Everett Lineo
