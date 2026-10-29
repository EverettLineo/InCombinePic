# 第三方开源组件声明

本项目的自有代码以 **MIT License** 发布（见根目录 `LICENSE`）。本项目在运行或构建时使用以下第三方组件，其许可证如下。分发本软件时须同时保留本文件与各组件的许可证全文。

> 本清单随依赖变更同步更新。新增依赖前须确认其许可证属宽松型（MIT / Apache-2.0 / BSD），禁止引入 GPL / AGPL / LGPL 组件（依据 `docs/adr/ADR-0002-license.md`）。

## 运行时依赖 —— 前端

| 组件 | 版本 | 许可证 | 版权声明要求 |
| --- | --- | --- | --- |
| React / React DOM | 待装配锁定 | MIT | 保留版权与许可文本 |
| Konva | 待装配锁定 | MIT | **须同时保留 KineticJS（Eric Rowell, 2011-2013）与 Konva（Anton Lavrenov, 2014-）两段版权声明** |
| Zustand | 待装配锁定 | MIT | 保留版权与许可文本 |
| Vite（构建期） | 待装配锁定 | MIT | 保留版权与许可文本 |

## 运行时依赖 —— 桌面壳

| 组件 | 版本 | 许可证 | 义务 |
| --- | --- | --- | --- |
| Tauri | 2.12.5（实测） | MIT 或 Apache-2.0（双许可，择一） | 保留版权与许可文本；若按 Apache-2.0 使用需附 NOTICE |
| WRY / TAO | 随 Tauri 锁定 | MIT 或 Apache-2.0 | 同上 |
| `tauri-plugin-opener` | 2.7.x | MIT 或 Apache-2.0 | 同上 |
| `tauri-plugin-dialog` | 2.8.4（实测） | MIT 或 Apache-2.0 | 同上 |
| `rfd`（由 dialog 插件引入的本地文件对话框） | 0.17.x（实测） | MIT | 保留版权与许可文本 |
| WebView2 Runtime | 系统提供 155.0.4283.45 | Microsoft 许可（非开源，随系统分发） | 不属于本项目分发范围 |

## 运行时依赖 —— Rust 图像管线

| 组件 | 版本 | 许可证 | 义务 |
| --- | --- | --- | --- |
| `image` | 待锁定 | Apache-2.0 | 保留声明，附 NOTICE |
| `fast_image_resize` | 6.1.0（实测） | Apache-2.0 | 同上 |
| `exif-rs`（`kamadak-exif`） | 0.6.1（实测） | BSD-2-Clause | 保留版权声明 |
| `arboard` | 3.x（实测） | MIT 或 Apache-2.0 | 剪贴板图片读取；保留版权与许可文本 |

## 明确排除

| 组件 | 原因 |
| --- | --- |
| GPL / AGPL / LGPL 类组件 | 与本项目 MIT 开源及潜在商业分发不兼容，不予引入 |
| `viliusle/miniPaint` | 许可证未核验（GitHub API 返回 NOASSERTION），**仅作交互设计参考，不得复制其代码** |
| HEIC/HEIF 解码库 | v1 明确不支持该格式（需求基线 §6.1、§15） |

## 维护规则

1. 每次新增依赖，须在此表登记并核验许可证原件，不得只依赖 `package.json` / `Cargo.toml` 的元数据。
2. 应用内「关于 → 开源许可」页面须展示本清单内容（T12.10 实现）。
3. Apache-2.0 组件需在分发包根目录附带其 NOTICE 文件。
