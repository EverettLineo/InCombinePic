# 第三方组件与许可证

本项目的自有代码以 **MIT** 发布（见 [`LICENSE`](./LICENSE)、范围说明见 [`NOTICE.md`](./NOTICE.md)）。下面登记运行时与构建期使用的第三方组件。

- 版本取自 `package-lock.json` 与 `src-tauri/Cargo.lock` 的实际锁定值，**不是** `package.json` / `Cargo.toml` 中的版本区间。
- 许可证取自各组件随包发布的元数据（`node_modules/*/package.json` 的 `license` 字段、`cargo metadata` 的 `license` 字段）。
- 再分发二进制时须保留本文件及下列版权声明。

> 选型约束（[`docs/adr/ADR-0002-license.md`](./docs/adr/ADR-0002-license.md)）：只接受宽松许可（MIT / Apache-2.0 / BSD / ISC / Zlib / Unicode）。**当前依赖图中没有 GPL / AGPL / 强制 LGPL 组件。**

## 一、运行时依赖 —— 前端（随产物打包）

| 组件 | 版本 | 许可证 | 义务 |
| --- | --- | --- | --- |
| React / React DOM | 19.3.1 | MIT | 保留版权与许可文本 |
| Konva | 10.9.0 | MIT | **须同时保留 KineticJS（Eric Rowell, 2011–2013）与 Konva（Anton Lavrenov, 2014–）两段版权声明** |
| Zustand | 5.0.16 | MIT | 保留版权与许可文本 |
| `@tauri-apps/api` | 2.12.4 | Apache-2.0 OR MIT | 按 MIT 分支使用，保留声明 |
| `@tauri-apps/plugin-dialog` | 2.8.4 | MIT OR Apache-2.0 | 同上 |
| `@tauri-apps/plugin-opener` | 2.7.2 | MIT OR Apache-2.0 | 同上 |

## 二、运行时依赖 —— 桌面壳

| 组件 | 版本 | 许可证 | 义务 |
| --- | --- | --- | --- |
| Tauri | 2.12.5 | Apache-2.0 OR MIT | 按 MIT 分支使用，保留声明 |
| WRY / TAO（Tauri 的窗口与 WebView 抽象） | 随 Cargo.lock 锁定 | MIT OR Apache-2.0 | 同上 |
| `tauri-plugin-dialog` | 2.8.4 | Apache-2.0 OR MIT | 同上 |
| `tauri-plugin-opener` | 2.7.2 | Apache-2.0 OR MIT | 同上 |
| `rfd`（dialog 插件引入的系统文件对话框） | 0.17.2 | MIT | 保留版权与许可文本 |
| `serde` / `serde_json` | 1.0.229 / 1.0.154 | MIT OR Apache-2.0 | 按 MIT 分支使用 |
| `base64` | 0.22.1 | MIT OR Apache-2.0 | 同上 |
| `arboard`（剪贴板读图） | 3.7.0 | MIT OR Apache-2.0 | 同上 |
| WebView2 Runtime | 系统提供（实测 155.0.4283.45） | Microsoft 许可，非开源 | 随系统分发，**不属于本项目分发范围** |

## 三、运行时依赖 —— Rust 图像管线

| 组件 | 版本 | 许可证 | 义务 |
| --- | --- | --- | --- |
| `image` | 0.25.10 | MIT OR Apache-2.0 | 按 MIT 分支使用（仅启用 png / jpeg / webp / bmp 特性）；保留声明 |
| `fast_image_resize` | 6.1.0 | MIT OR Apache-2.0 | 同上 |
| `kamadak-exif` | 0.6.1 | BSD-2-Clause | 保留版权声明与许可全文 |

> **许可分支说明**：`image`、`fast_image_resize`、`tauri` 等均为双许可。本项目统一按 **MIT** 分支使用，因此不产生 Apache-2.0 的 NOTICE 附加义务；但各组件的版权声明仍须保留。若日后改按 Apache-2.0 分支使用，须在分发包内补附其 NOTICE。

## 四、构建期依赖（不进入运行产物）

| 组件 | 版本 | 许可证 |
| --- | --- | --- |
| Vite | 8.3.5 | MIT |
| TypeScript | 6.0.3 | Apache-2.0 |
| Vitest | 3.2.7 | MIT |
| ESLint / `@eslint/js` | 9.39.5 | MIT |
| `typescript-eslint` | 8.72.1 | MIT |
| `@vitejs/plugin-react` | 6.1.2 | MIT |
| `globals` | 15.15.0 | MIT |
| `@types/react` / `@types/react-dom` | 19.3.0 | MIT |
| `@tauri-apps/cli` | 2.12.4 | Apache-2.0 OR MIT |
| `tauri-build` | 2.7.4 | Apache-2.0 OR MIT |
| lightningcss（Vite 的 CSS 压缩器） | 1.33.0 | MPL-2.0 |

## 五、MPL-2.0 组件（文件级弱著佐权）

依赖图中共 6 个 MPL-2.0 组件，**均非本项目直接依赖**：

| 组件 | 版本 | 引入路径 |
| --- | --- | --- |
| `cssparser` / `cssparser-macros` / `dtoa-short` / `selectors` | 0.37.0 / 0.7.1 / 0.3.5 / 0.38.0 | `tauri-utils → dom_query`（构建期 codegen） |
| `option-ext` | 0.2.0 | `tauri → dirs → dirs-sys` |
| lightningcss | 1.33.0 | Vite（构建期） |

MPL-2.0 是**文件级**弱著佐权：义务限于这些组件自身的源文件——保留许可证与版权声明，并说明其源码可从 crates.io（Rust）与 npm（前端）按上表版本获取（版本号已由 `Cargo.lock` / `package-lock.json` 锁定）。它**不要求**本项目以 MPL 开源，也不改变本项目自有代码的 MIT 授权。

## 六、依赖许可证分布（实测）

统计口径：Rust 侧 `cargo metadata` 共 **479** 个包（含传递依赖）；前端 `node_modules` 共 **167** 个包。

| 许可证 | Rust 包数（共 479） | 前端包数（共 167） |
| --- | --- | --- |
| MIT（含 `MIT OR Apache-2.0` 等双许可） | 441 | 134 |
| Apache-2.0（含双许可中的 Apache 分支） | 316 | 19 |
| BSD（2 / 3 条款） | 13 | 8 |
| ISC | 1 | 8 |
| Zlib | 25 | — |
| Unicode-3.0 | 19 | — |
| MPL-2.0 | 5 | 2 |
| 其他宽松型 | 2（均为 BSL-1.0：`clipboard-win`、`error-code`） | 1（Python-2.0） |

> 双许可组件同时计入两类，故列合计大于包总数。GPL / AGPL / 强制 LGPL：**0**。`r-efi` 为 `MIT OR Apache-2.0 OR LGPL-2.1-or-later` 三选一，按 MIT 使用，不构成 LGPL 义务。

## 七、明确排除

| 组件 | 原因 |
| --- | --- |
| GPL / AGPL / 强制 LGPL 类组件 | 与本项目 MIT 开源及潜在商业分发不兼容，不予引入 |
| `viliusle/miniPaint` | 许可证未核验（GitHub API 返回 NOASSERTION），**仅作交互设计参考，未复制其代码** |
| HEIC / HEIF 解码库 | v0.2.0 明确不支持该格式（需求基线 §6.1、§15） |

## 八、维护规则

1. 新增依赖前先核验许可证原件（打开组件仓库的 `LICENSE`，不只看包管理器元数据），并确认属宽松型。
2. 依赖变更后同步更新本文件的版本列——版本取自锁文件，不写区间。
3. 应用内「关于 → 开源许可」展示本文件内容的摘要（`src/features/about/`）。
4. 正式发布前如需附各组件许可证全文，从 crates.io / npm 对应版本取 `LICENSE*` 一并打包，不要手抄。
