# 发布交付物核对（T12.11）

对应基线 §18.3 要求的 10 项交付物。**本表只写实际状态**：未完成的写「未完成」，未验证的写「未验证」，不写「基本完成」。

- 版本：0.2.0
- 核对日期：2026-11-03
- 结论：**未达发布条件**，缺口见文末。

## 一、交付物清单

| # | 基线要求 | 交付物 | 状态 |
| --- | --- | --- | --- |
| 1 | Windows 正式安装程序 | `src-tauri/target/release/bundle/nsis/In拼图·何罗鱼_0.2.0_x64-setup.exe`（2.27 MiB） | **已产出**（2026-11-03 重新打包，含发布元数据）；安装/卸载未验证 |
| 2 | 完整、可读、可构建的源码 | 本仓库（git，含全部源码与测试） | 完成 |
| 3 | README 与开发环境搭建说明 | [`README.md`](../README.md)「环境要求」「开发」 | 完成 |
| 4 | 运行、调试、测试、构建与打包说明 | [`README.md`](../README.md)「质量门禁」「构建与打包」「性能」 | 完成 |
| 5 | 需求基线与任务追踪表 | [`图片拼接工具_工程需求基线_v1.16.md`](../图片拼接工具_工程需求基线_v1.16.md)、[`task.md`](../task.md) | 完成 |
| 6 | 架构文档与关键 ADR | [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)、[`docs/adr/`](./adr/)（8 份） | 完成 |
| 7 | 兼容性矩阵 | [`docs/COMPATIBILITY.md`](./COMPATIBILITY.md) | 完成（严格区分实测/未测） |
| 8 | 测试报告 | [`docs/TEST_REPORT.md`](./TEST_REPORT.md)（含 TR-01~TR-05N） | 完成 |
| 9 | 已知问题清单 | [`docs/KNOWN_ISSUES.md`](./KNOWN_ISSUES.md)（KI-01~KI-26） | 完成 |
| 10 | 版本历史与变更记录 | [`docs/CHANGELOG.md`](./CHANGELOG.md) | 完成 |
| 11 | 许可证 | [`LICENSE`](../LICENSE)（MIT）、[`NOTICE.md`](../NOTICE.md)（版权与品牌资产范围） | 完成 |
| 12 | 第三方许可清单 | [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)（版本取自锁文件实测） | 完成 |
| 13 | 安装包发布元数据 | `tauri.conf.json` → `publisher` / `copyright` / `license` / `category` / 描述 / `homepage` | **已配置**，需重新打包生效 |

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
| 构建耗时 | 4 分 09 秒（含前端 0.7 s，2026-11-04 重新打包） |
| 安装包 | `In拼图·何罗鱼_0.2.0_x64-setup.exe`，**2.28 MiB**（2,385,699 字节） |
| 可执行文件 | `pintu.exe`，**7.55 MiB**（7,916,544 字节） |
| SHA-256（本次安装包） | `59359062D7D520D5F3DDB55C5EE55ECA833A92A469FD4895A5B9706C778BF5BE` |
| 前端产物 | 按依赖拆分为 react 218.7 kB / konva 189.2 kB / vendor 20.0 kB，应用代码 99.9 kB，无 >500 kB 单块 |
| 构建后启动 | 已实测：进程存活，工作集 27 MB，无崩溃 |
| 发布元数据 | **已实测生效**：`pintu.exe` 的 Company=Everett Lineo、Copyright 正确；`installer.nsi` 中 `MANUFACTURER="Everett Lineo"` 并写入卸载项 `Publisher`；`ProductName`/`FileVersion` 为 `In拼图·何罗鱼` / `0.2.0` |
| 干净环境安装 | **未验证**（需要一台未装过本应用的机器或虚拟机） |
| 卸载残留 | **未验证** |
| 升级覆盖安装 | **未验证**（v1 首个版本，暂无前一版本可升） |
| 卸载不删用户导出文件 | **未验证** —— 设计上安装包只写安装目录与 `%APPDATA%\com.everettlineo.pintu`，不碰用户图片目录，但未实测 |

> 安装包已构建成功这一点本身有信息量：`bundle.targets` 若写成不存在的目标、图标缺失、NSIS 脚本模板不匹配，都会在打包阶段直接失败。但它**不代表**安装后能正常运行——那必须在一台干净机器上点一次。

## 三、版本号一致性

| 位置 | 值 |
| --- | --- |
| `package.json` → `version` | 0.2.0 |
| `src-tauri/tauri.conf.json` → `version` | 0.2.0 |
| `src-tauri/Cargo.toml` → `package.version` | 0.2.0 |
| 安装包文件名 | 应含 `0.2.0` |
| `docs/CHANGELOG.md` 最新条目 | 对应 0.2.0 |

## 四、发布前必须闭合的缺口

| 缺口 | 归属 | 是否阻断发布 |
| --- | --- | --- |
| 人工走查项（KI-13/14/16~21/23~26） | 人工 | **是** |
| G10 的三条导出验收（像素差分 / JPEG 三档 / 元数据核验） | 人工 | **是** |
| 安装/卸载/残留验证 | 人工 | **是** |
| 20 个模板名单确认（D-07） | 用户确认 | **是** |
| asset 协议 scope 收窄（KI-11） | 开发 | 否（发布前完成即可） |
| Fit to Content（T3.5 剩余） | 开发 | 否（v1 范围外，已在任务表标注） |
| 控制点缩放之外的旋转/翻转手柄（T5.6） | 开发 | 否（数值面板可替代） |

## 五、发布操作步骤

按顺序执行，任一步失败即停止，不要带着失败继续往下走。

**1. 关掉正在运行的应用**

Windows 不允许覆盖正在运行的 exe，`tauri build` 会在链接阶段报「拒绝访问」。任务管理器里确认 `pintu.exe` 已退出。

**2. 全量校验**

```bash
npm ci
npm run typecheck
npm run lint
npm test
cd src-tauri && cargo test && cd ..
```

**3. 打包**

```bash
npm run tauri build
```

确认 `src-tauri/target/release/bundle/nsis/` 下的安装包文件名含 `0.2.0`，且时间戳是本次构建。

**4. 校验产物元数据**

右键安装包 →「属性 → 详细信息」，应能看到产品名 `In拼图·何罗鱼`、版本 `0.2.0`、发布者 `Everett Lineo`。若发布者为空，说明 `tauri.conf.json` 的 `bundle.publisher` 没生效。

记录安装包 SHA-256，发布说明里一并给出：

```powershell
Get-FileHash "src-tauri\target\release\bundle\nsis\In拼图·何罗鱼_0.2.0_x64-setup.exe" -Algorithm SHA256
```

**5. 打标签**

```bash
git add -A
git commit -m "chore(release): v0.2.0"
git tag -a v0.2.0 -m "In拼图·何罗鱼 v0.2.0"
git push origin master --tags
```

**6. 发布**

在托管平台创建 Release，标题 `v0.2.0`，正文取 [`docs/CHANGELOG.md`](./CHANGELOG.md) 对应条目，上传安装包，附 SHA-256。

**7. 已知的发布后现象（不是缺陷）**

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 首次运行弹出 SmartScreen「Windows 已保护你的电脑」 | 安装包未做代码签名 | 在发布说明中写明「未签名，需点『更多信息 → 仍要运行』」；如需消除，需购买代码签名证书 |
| 安装时提示未知发布者 | 同上 | 同上 |
| 安装后首次启动约 1~2 秒 | WebView2 初始化 | 无需处理 |
