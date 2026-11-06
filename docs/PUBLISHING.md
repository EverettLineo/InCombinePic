# 用 GitHub Packages 分发 npm 包

本仓库发布到 GitHub Packages 的是**源码包** `@everettlineo/pintu`，用于内部复用、审计与依赖锁定。
终端用户应下载 Releases 中的安装程序；npm 包不含可执行文件，安装后不能直接运行应用。

## 一、前置条件

- 仓库已在 GitHub 上，默认分支包含本配置。
- 包名必须带作用域且全小写：`@everettlineo/pintu`。GitHub Packages 不接受无作用域的包名。
- 单版本 tarball 上限 256 MB（当前约 2.9 MB）。

## 二、本地认证（一次性）

使用 personal access token (classic)，scope 至少 `write:packages`（已含读取）；仅安装他人私有包时用 `read:packages`。

```bash
npm login --scope=@everettlineo --auth-type=legacy --registry=https://npm.pkg.github.com
# Username：GitHub 用户名
# Password：PAT（不是账号密码）
```

令牌由 npm 写入用户级 `~/.npmrc`。**项目内 `.npmrc` 只写作用域路由，不写令牌**，避免误提交。

## 三、发布

```bash
npm ci
npm run typecheck
npm test
npm pack --dry-run     # 先看清单与体积，确认没有把 target/ 或 node_modules 打进去
npm publish            # 读取 publishConfig，发往 GitHub Packages，restricted
```

首次发布后，到仓库的 Packages 页面确认可见性与仓库关联是否正确。

## 四、CI 发布

工作流：[`.github/workflows/publish-package.yml`](../.github/workflows/publish-package.yml)

| 项 | 说明 |
| --- | --- |
| 触发 | 推送 `v*` tag；或手动 `workflow_dispatch`（默认只演练，不发布） |
| 权限 | `contents: read` + `packages: write`，认证使用 `GITHUB_TOKEN` |
| 校验 | tag 与 `package.json` 版本不一致时直接失败；发布前跑 typecheck 与测试 |
| 令牌 | 不落仓库 secret，由 `actions/setup-node` 注入 `NODE_AUTH_TOKEN` |

```bash
git tag -a v0.2.0 -m "In拼图·何罗鱼 v0.2.0"
git push origin master --tags
```

## 五、安装

使用方项目需要同样的作用域映射：

```ini
@everettlineo:registry=https://npm.pkg.github.com
```

认证方式二选一：本地 `npm login`，或在 CI 中提供 `NODE_AUTH_TOKEN`。随后正常安装：

```bash
npm install @everettlineo/pintu
```

## 六、安全要求

- 令牌只出现在两处：用户级 `~/.npmrc` 或 CI 的 secret。项目内任何文件都不得包含令牌。
- PAT 取最小 scope，启用 2FA；怀疑泄露立即在 GitHub 设置里撤销并重新登录。
- 包可见性由所关联的仓库决定：仓库 public 时包也 public（`publishConfig.access` 不改变继承结果）。需要私有包就把仓库改为 private。
- `publishConfig.registry` 固定为 GitHub Packages，避免手误发到 npmjs.org（发上去即为公开）。
- 每次发布后检查 Packages 页面的可见性与协作者列表。
- 删除已发布版本在 GitHub 包页面操作；`npm unpublish` 对已发布版本通常不可用，发布前先用 `--dry-run`。

## 七、仓库关联

`package.json` 的 `repository` 已指向 `https://github.com/EverettLineo/InCombinePic.git`，
发布后包会自动关联到该仓库并继承其访问权限。

仓库为 public，因此包也会随仓库公开——这与代码本身 MIT 开源一致；
若后续需要私有包，应把仓库改为 private，或在包设置中单独调整可见性并解除继承。

## 八、排错

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| `403 Forbidden` | 令牌缺 `write:packages`，或包属于其他命名空间 | 重新签发 PAT |
| `404 Not Found` | 作用域未映射、包名拼错、包不存在 | 检查 `.npmrc` 与包名 |
| `E401` | 未登录或令牌过期 | 重新 `npm login` |
| `E409` | 同版本已存在，npm 不允许覆盖 | 升版本后重发 |
| `EOTP` | 账号开了 2FA 却用密码认证 | 改用 PAT 作为密码 |
| 提示包名非法 | 未加作用域 | 改为 `@everettlineo/...` |

## 九、发布记录

| 版本 | 时间 | 触发方式 | 结果 |
| --- | --- | --- | --- |
| 0.2.0 | 2026-11-06 | 推送 `v0.2.0` 标签 | 工作流 `publish-package` 成功（52 秒），包已上线 |

包地址：<https://github.com/EverettLineo/InCombinePic/pkgs/npm/pintu>

安装（源码包，不含可执行文件）：

```bash
npm install @everettlineo/pintu
```
