# 版本变更记录

本项目当前处于 v1 开发期，尚未发布。以下记录**工程里程碑**，不表示可用版本。

格式：日期 · 阶段 · 变更内容

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
