# 发布交付物核对（T12.11）

对应基线 §18.3 要求的 10 项交付物。**本表只写实际状态**：未完成的写「未完成」，未验证的写「未验证」，不写「基本完成」。

- 版本：0.1.0
- 核对日期：2026-10-30
- 结论：**未达发布条件**，缺口见文末。

## 一、交付物清单

| # | 基线要求 | 交付物 | 状态 |
| --- | --- | --- | --- |
| 1 | Windows 正式安装程序 | `src-tauri/target/release/bundle/nsis/In拼图_0.1.0_x64-setup.exe`（2.23 MiB） | **已产出**，安装/卸载未验证 |
| 2 | 完整、可读、可构建的源码 | 本仓库（git，含全部源码与测试） | 完成 |
| 3 | README 与开发环境搭建说明 | [`README.md`](../README.md)「环境要求」「开发」 | 完成 |
| 4 | 运行、调试、测试、构建与打包说明 | [`README.md`](../README.md)「校验」「构建与打包」「压力测试」 | 完成 |
| 5 | 需求基线与任务追踪表 | [`图片拼接工具_工程需求基线_v1.16.md`](../图片拼接工具_工程需求基线_v1.16.md)、[`task.md`](../task.md) | 完成 |
| 6 | 架构文档与关键 ADR | [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)、[`docs/adr/`](./adr/)（8 份） | 完成 |
| 7 | 兼容性矩阵 | [`docs/COMPATIBILITY.md`](./COMPATIBILITY.md) | 完成（严格区分实测/未测） |
| 8 | 测试报告 | [`docs/TEST_REPORT.md`](./TEST_REPORT.md)（含 TR-01~TR-05M） | 完成 |
| 9 | 已知问题清单 | [`docs/KNOWN_ISSUES.md`](./KNOWN_ISSUES.md)（KI-01~KI-21） | 完成 |
| 10 | 版本历史与变更记录 | [`docs/CHANGELOG.md`](./CHANGELOG.md) | 完成 |

补充交付物（非基线要求，但有实际价值）：

| 文件 | 用途 |
| --- | --- |
| [`docs/SHORTCUTS.md`](./SHORTCUTS.md) | 快捷键总表与焦点优先级 |
| [`docs/OPEN_SOURCE_SURVEY.md`](./OPEN_SOURCE_SURVEY.md) | 选型调研 |
| [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) | 第三方许可清单 |

## 二、安装包

| 项 | 结果 |
| --- | --- |
| 构建命令 | `npx tauri build`（`bundle.targets = ["nsis"]`） |
| 构建耗时 | 4 分 53 秒（含前端 0.9 s） |
| 安装包 | `In拼图_0.1.0_x64-setup.exe`，**2.23 MiB** |
| 可执行文件 | `pintu.exe`，**7.4 MiB** |
| 构建后启动 | 已实测：进程存活，工作集 27 MB，无崩溃 |
| 干净环境安装 | **未验证**（需要一台未装过本应用的机器或虚拟机） |
| 卸载残留 | **未验证** |
| 升级覆盖安装 | **未验证**（v1 首个版本，暂无前一版本可升） |
| 卸载不删用户导出文件 | **未验证** —— 设计上安装包只写安装目录与 `%APPDATA%\com.everettlineo.pintu`，不碰用户图片目录，但未实测 |

> 安装包已构建成功这一点本身有信息量：`bundle.targets` 若写成不存在的目标、图标缺失、NSIS 脚本模板不匹配，都会在打包阶段直接失败。但它**不代表**安装后能正常运行——那必须在一台干净机器上点一次。

## 三、版本号一致性

| 位置 | 值 |
| --- | --- |
| `package.json` → `version` | 0.1.0 |
| `src-tauri/tauri.conf.json` → `version` | 0.1.0 |
| `src-tauri/Cargo.toml` → `package.version` | 0.1.0 |
| 安装包文件名 | 应含 `0.1.0` |
| `docs/CHANGELOG.md` 最新条目 | 对应 0.1.0 |

## 四、发布前必须闭合的缺口

| 缺口 | 归属 | 是否阻断发布 |
| --- | --- | --- |
| 9 个人工验证项（KI-13/14/16~21） | 人工走查 | **是** |
| G10 的三条导出验收（像素差分 / JPEG 三档 / 元数据核验） | 人工 | **是** |
| 安装/卸载/残留验证 | 人工 | **是** |
| 20 个模板名单确认（D-07） | 用户确认 | **是** |
| asset 协议 scope 收窄（KI-11） | 开发 | 否（发布前完成即可） |
| Fit to Content（T3.5 剩余） | 开发 | 否（v1 范围外，已在任务表标注） |
| 控制点缩放之外的旋转/翻转手柄（T5.6） | 开发 | 否（数值面板可替代） |
