# 拼图工具

面向 Windows 的本地图片拼接工具：导入多张图片 → 自由画布或模板布局排版 → 导出 PNG / JPG。

**全部处理在本地完成，不上传任何图片或编辑数据。**

## 当前状态

**P0 阶段完成，P1 工程骨架未开始。** 本仓库目前只有需求、架构与验证文档，尚无应用代码。

进度以 [`task.md`](./task.md) 为唯一真源。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2 |
| 前端 | React + TypeScript + Vite |
| 画布引擎 | Konva（MIT） |
| 图像处理 | Rust：`image` / `fast_image_resize` / `exif-rs` |

详见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) 与 [`docs/adr/`](./docs/adr/)。

## 环境要求（已实测）

| 依赖 | 版本 |
| --- | --- |
| Windows | 11（已验证 10.0.26300 x64） |
| Rust | 1.99.1（`x86_64-pc-windows-msvc`） |
| Node.js | 22.x |
| WebView2 Runtime | 已随系统安装（155.x） |
| MSVC 生成工具 | 可用（支持非默认安装路径） |

## 运行与构建

> 待 P1 完成后补全。首次 `tauri build` 会从 GitHub 下载 WiX / NSIS 工具链，**构建机需联网**；应用运行本身完全离线。

## 文档索引

| 文件 | 内容 |
| --- | --- |
| [`task.md`](./task.md) | 任务真源、门禁、下一步 |
| [`docs/REQUIREMENTS.md`](./docs/REQUIREMENTS.md) | 需求基线追踪 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 分层、数据模型、变换管线 |
| [`docs/COMPATIBILITY.md`](./docs/COMPATIBILITY.md) | 兼容性矩阵（区分实测 / 未测） |
| [`docs/TEST_REPORT.md`](./docs/TEST_REPORT.md) | 测试结果（通过 / 失败 / 未测试） |
| [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) | 已知问题与规避 |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | 版本变更 |
| [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) | 第三方许可 |

## 许可证

自有代码：[MIT](./LICENSE) © 2026 Everett Lineo
