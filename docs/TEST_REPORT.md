# 测试报告

- 版本：v0.1（P0 阶段）
- 日期：2026-10-27
- 状态标注约定：**通过** / **失败** / **未测试** / **已知问题**（依据基线 §14.3，禁止用"通过"替代未执行项）

## 测试环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows 11 专业版 10.0.26300（64 位） |
| CPU / 内存 | 15.2 GB RAM |
| Rust | 1.99.1（`x86_64-pc-windows-msvc`） |
| Node.js / npm | 22.22.2 / 10.9.7 |
| WebView2 | 155.0.4283.45 |
| MSVC | Visual Studio Community 2026（`C:\DATAs\virtual studio`，非默认路径） |
| 验证工程 | `C:\TEMPs\_probe_img`（一次性探测工程，非正式项目） |

---

## TR-01 图像解码能力验证（对应 T0.8）

**方法**：Rust 工程引入 `image 0.25.10`、`kamadak-exif 0.6.1`，程序化生成 8 类样本后逐一解码、探测格式、解析 EXIF、注入异常输入。异常用例用 `catch_unwind` 捕获 panic。

**样本**：PNG(1200×800, RGBA)、JPEG(1600×1200)、BMP(640×480)、WebP(800×600, 无损)、JPEG(8000×6000)、带 EXIF Orientation=6 的 JPEG、伪造 HEIC 签名文件、截断 PNG。

### 结果

| 用例 | 期望 | 实际 | 状态 |
| --- | --- | --- | --- |
| PNG 解码 | 成功，保留 alpha | `1200x800 color=Rgba8`，3.7 ms | 通过 |
| JPEG 解码 | 成功 | `1600x1200 color=Rgb8`，8.4 ms | 通过 |
| BMP 解码 | 成功 | `640x480 color=Rgb8`，2.7 ms | 通过 |
| WebP 解码 | 成功 | `800x600 color=Rgba8`，2.1 ms | 通过 |
| 格式探测 | 四种格式均正确识别 | `Png / Jpeg / Bmp / WebP` 全部正确 | 通过 |
| EXIF Orientation | 读出方向值 | `field=Short([6]) value=6` | 通过 |
| 无 EXIF 的 PNG | 不报错崩溃，按方向=1 处理 | 返回 `No Exif data found in PNG`，可捕获处理 | 通过 |
| HEIC 输入 | 明确拒绝，不崩溃 | 返回 `extension .heic was not recognized`，无 panic | 通过 |
| 截断 PNG | 返回错误，不崩溃 | 返回 `unexpected end of file`，无 panic | 通过 |
| 8000×6000 大图 | 可解码，记录耗时与内存 | 198.3 ms，RGBA 需 183.1 MB | 通过 |

### 关键数据

```
PNG  1200x800  →  3.7 ms   Rgba8
JPEG 1600x1200 →  8.4 ms   Rgb8
BMP   640x480  →  2.7 ms   Rgb8
WebP  800x600  →  2.1 ms   Rgba8
JPEG 8000x6000 → 198.3 ms  Rgb8  (RGBA 183.1 MB / RGB 137.3 MB)
格式支持：PNG=true JPEG=true WebP=true BMP=true HEIC=false
```

### 由数据直接推出的三个设计结论

1. **分级解码不是优化项，是必需项。** 单张 8000×6000 解码后占 183 MB；基线要求支持 50 张压力测试，若全部按原分辨率驻留内存，量级达 9 GB。因此 `ARCHITECTURE.md` §6 的"显示用小图缓存 + 导出时按需重采样"必须实现，不能作为后续优化顺延。
2. **格式探测与解码必须分两步校验。** 截断 PNG 的 `guess_format` 仍返回 `Png`（头部魔数完整），真正失败发生在解码阶段。因此导入流程不能"探测通过即认为可导入"，必须在解码失败时走跳过 + 汇总路径（基线 §6.3）。
3. **HEIC 无需额外屏蔽逻辑。** `image` 默认不含 HEIC 解码器，遇到即返回错误；只需把该错误映射为基线 §6.1 要求的中文提示（"当前不支持 HEIC/HEIF，请先转换为 JPG 或 PNG"）。

### 测试局限（须在后续补测）

| 局限 | 影响 | 补测计划 |
| --- | --- | --- |
| HEIC 样本为手工构造的 `ftyp` 签名文件，非真实 HEIC 照片 | 只验证了"识别失败不崩溃"，未覆盖真实 HEIC 的文件结构 | 若需更严格验证，取一张真实 HEIC 照片复测（v1 不支持该格式，优先级低） |
| WebP 仅测无损变体 | 未覆盖有损 WebP（VP8） | T2.x 导入实现时补一张真实有损 WebP |
| 未覆盖 CMYK JPEG、16 位 PNG、渐进式 JPEG | 真实用户图片可能出现 | 并入 T12.2 异常输入测试 |
| 未做 ICC 色彩配置验证 | 涉及"避免明显偏色"（基线 §12.5） | 并入 T10.10 |

---

## TR-02 依赖裁剪与回归验证（对应 T0.15）

**动机**：TR-01 的编译日志显示，`image` 默认 feature 把 `tiff`、`exr`、`avif/ravif`、`tga`、`ico`、`hdr` 等未使用编解码器全部编入，属无收益的编译耗时与解析面（攻击面）扩大。

**变更**：

```toml
image = { version = "0.25.10", default-features = false,
          features = ["png", "jpeg", "webp", "bmp"] }
```

**对比结果（`cargo clean` 后全量 release 构建）**：

| 指标 | 裁剪前 | 裁剪后 | 变化 |
| --- | --- | --- | --- |
| release 构建耗时 | 59.98 s | **21.76 s** | −64% |
| Cargo.lock 依赖包数 | 126 | **34** | −73% |
| 产出 exe 体积 | 未采集 | 1,185,792 B（约 1.13 MiB） | — |
| PNG 解码 | 3.7 ms | 3.9 ms | 持平 |
| JPEG 解码 | 8.4 ms | 7.2 ms | 持平 |
| BMP 解码 | 2.7 ms | 2.6 ms | 持平 |
| WebP 解码 | 2.1 ms | 1.4 ms | 持平 |
| 8000×6000 JPEG | 198.3 ms | 199.7 ms | 持平 |

**回归结论**：`PNG=true JPEG=true WebP=true BMP=true HEIC=false`，四种格式解码与格式探测结果与裁剪前**完全一致**，EXIF 与异常输入行为未变。**通过**。

> 结论：P1 正式工程直接采用该 feature 配置，不保留默认全开。

---

## TR-03 画布引擎装配验证（对应 T0.14）

**目的**：验证「`DocumentState` → `SceneDescriptor` → Konva 投影」这条数据流的正确性与 50 实例下的帧预算。

**方法**：构建一个 Tauri 2 探测应用（React + Konva 10.9.0），在**真实 WebView2 运行环境**中执行基准，结果由 Rust 命令写入 JSON 落盘，不以截图或肉眼判读为准。

**条件**：文档画布 2400×1600，视图缩放 50%（Stage 1200×800），50 个实例（每个 400×300 带渐变纹理的占位位图），`devicePixelRatio = 2`。

### 结果

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 运行时 | WebView2 / Chromium 155（`Edg/155.0.0.0`） | 真实目标运行时 |
| Konva 版本 | 10.9.0 | — |
| 派生耗时（状态→场景描述） | avg **0.01 ms**，p95 0.1 ms，max 0.1 ms | 50 实例下可忽略 |
| 首屏完整渲染 | **5.3 ms** | `layer.draw()` 同步绘制 50 张图 |
| 场景 A 直接改节点 | avg 0.04 ms | 见下方"测量缺陷" |
| 场景 B 完整管线 | avg 0.11 ms | 见下方"测量缺陷" |
| **实际帧间隔** | **17.3 ms → 57.8 fps** | **本项最可信的性能指标** |
| 节点数 | 50 | 与实例数一致 |

### 正确性断言（4/4 通过）

| 断言 | 结果 |
| --- | --- |
| 节点数等于实例数（50） | 通过 |
| 节点顺序与实例数组顺序一致（首尾校验） | 通过 |
| 首个节点几何与文档状态一致 | 通过 |
| 管线更新后节点位置与状态同步（误差 < 0.001 px） | 通过 |

### 结论

1. **数据流成立。** "状态为真相、Konva 为投影"的设计在真实运行时可用，diff 更新不影响顺序与几何正确性。
2. **派生层零负担。** 50 实例派生 0.01 ms，说明每次交互全量重新派生是安全的，不必为性能引入增量派生或记忆化。**这将显著简化状态管理实现。**
3. **50 实例交互不掉帧。** 每帧在完成"派生 + diff 应用 + 重绘"的前提下，帧间隔 17.3 ms（理想 16.7 ms），无成片掉帧。基线 §14.2 要求"典型 2–10 张、压测 50 张时拖动缩放保持可用"**初步达成**。
4. **首屏 5.3 ms** 意味着资源库导入后一次性重建场景无需分帧处理。

### 测量缺陷（必须记录，不得据此夸大性能）

`layer.batchDraw()` 是**延迟绘制**，它只是把重绘排入下一帧。因此场景 A/B 测得的 0.04 ms / 0.11 ms **只是入队耗时，不是真实光栅化耗时**；表中"estFps 25000 / 9090"这类推算值**无意义，不予采用**。

真实绘制成本由 `layer.draw()` 的 5.3 ms（同步）与帧间隔 17.3 ms 反映。后续如需精确到"每帧光栅化耗时"，应在正式应用里用 Chrome Tracing / Performance 面板采样，而不是在基准里推算。**此项列为 T3.7 的实现要求。**

### 本次未覆盖（属 T0.9 / T3.7 范围）

- 100% 缩放与 200% 缩放下的绘制成本（本次固定 50%）。
- 真实照片位图（本次为 Canvas 占位图，未含大尺寸解码数据）。
- 裁剪、圆角、边框、透明度混合叠加后的绘制成本。
- 导出条带渲染路径。

---

## TR-04 工程骨架与门禁 G1 验证（对应 T1.1 / T1.3 / T1.5 / T1.7 / T1.8）

**环境**：仓库根目录 `C:\TEMPs\workspace\workbuddy\🧩拼图工具`，应用版本 0.1.0。

### 构建与静态检查

| 检查项 | 命令 | 结果 | 状态 |
| --- | --- | --- | --- |
| TypeScript 类型检查 | `npm run typecheck` | 无输出（0 错误） | 通过 |
| 前端单元测试 | `npm test` | 1 个文件 / **14 用例通过** | 通过 |
| ESLint | `npm run lint` | 0 错误 0 警告 | 通过 |
| Rust 单元测试 | `cargo test` | **2 用例通过** | 通过 |
| 前端生产构建 | `npm run build` | 221.73 kB JS（gzip 69.63 kB）+ 2.99 kB CSS | 通过 |
| Tauri release 构建 | `npx tauri build --no-bundle` | 产出 `pintu.exe`，编译 2 分 04 秒 | 通过 |
| 应用启动 | 运行 exe 并观察 5 秒 | 进程存活（PID 18336，内存 39,912 K），未异常退出 | 通过 |

### 架构边界规则有效性验证（关键）

规则写进配置不等于生效。用故意违规的临时文件实测三类越界，确认 lint 能在构建期拦下：

| 违规文件 | 违规内容 | lint 结果 |
| --- | --- | --- |
| `src/domain/probe/bad_konva.ts` | domain 内 import konva | **拦截**：`domain 层必须保持纯净…（§1 规则 1）` |
| `src/domain/probe/bad_ipc.ts` | domain 内 import `@tauri-apps/api/core` | **拦截**：同上 |
| `src/features/canvas/bad_ipc.ts` | features 内直接 import IPC | **拦截**：`IPC 只允许通过 src/platform 调用（§1 规则 3）` |

删除探针文件后 `npm run lint` 恢复 0 错误。**结论：三条边界规则均为有效约束，不是摆设。**

### 过程中遇到的真实缺陷（已修复，记录备查）

| 问题 | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| D-001 | `cargo build` 报 `E0433: cannot find __cmd__app_info in commands` | `#[tauri::command]` 生成的隐藏符号位于**命令所属模块内**，而 `generate_handler!` 按给出的路径查找 | 改为 `commands::app_info::app_info` 完整路径，并在 `lib.rs` 注释说明 |

### 本次未覆盖

- 三栏布局的像素级还原与响应式（属 T1.2 完成标准）
- 17 寸以下小屏与 200% 缩放的排版
- 日志、偏好持久化（T1.4 / T11.4 未开始）

### 补充：T1.6 状态层验证（同日）

| 检查项 | 结果 |
| --- | --- |
| 前端用例总数 | **44 通过**（geometry 14 / document 17 / library 13） |
| TypeScript | 0 错误 |
| ESLint | 0 错误 0 警告 |
| 前端构建 | 225.29 kB JS（gzip 71.11 kB） |

**用例覆盖的行为契约**（这些是后续功能的正确性底座，不是凑数）：

| 契约 | 对应基线 |
| --- | --- |
| 删除实例不删资源、释放资源级联删除其全部实例 | §7.3、§6.6 |
| 画布尺寸变更不移动/缩放既有实例 | §5.3 |
| 90° 旋转不改变 `frame` 与 `crop` | §8.3 |
| 裁剪被约束在源图内且不退化 | §8.4 |
| 切换排序模式后再切回，恢复原手动顺序 | §6.5 |
| 同名文件以导入序号做稳定次级排序 | §6.5 |
| 新导入条目追加到自定义顺序末尾，不插入中间 | §6.5 |

**发现的缺陷（已修复）**

| 编号 | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| D-002 | `setCrop` 在裁剪起点顶到源图边缘时产出零面积裁剪 | `clamp(w, 1, source.w - x)` 在 `x == source.w` 时上界变 0，`min > max`，`Math.min` 直接返回 0 | 上界改为 `Math.max(1, source.w - x)`，`x` 上界取 `source.w - 1`；补边界用例 |

---

## TR-05 导入与解码链路验证（对应 T2.1 / T2.4 / T2.5 / T2.6 / T2.11）

**形态**：Rust 侧 `imaging::probe_one` / `probe_many` 已覆盖为自动化单测（`cargo test`），前端编排层由类型检查与手工路径保证。

### 自动化测试结果（`cargo test`，10 项全通过）

| 用例 | 验证的行为 | 结果 |
| --- | --- | --- |
| `png_with_alpha_is_detected` | PNG 可导入，`has_alpha` 正确，尺寸正确 | 通过 |
| `jpeg_and_bmp_are_supported` | JPEG / BMP 可导入，格式标识正确 | 通过 |
| `truncated_png_fails_with_decode_error_not_panic` | 截断文件判定失败并给出可解释错误码，不 panic | 通过 |
| `heic_signature_is_rejected_with_hint` | HEIC 被拒绝，且**必须带转换建议** | 通过 |
| `heic_renamed_to_jpg_is_still_rejected` | **HEIC 改名成 .jpg 仍被识别并拒绝**（按 ftyp brand 判定，不看扩展名） | 通过 |
| `missing_file_reports_io_error` | 文件不存在映射为 `IO_FAILED` | 通过 |
| `batch_isolates_failures_and_keeps_order` | 3 个文件中间 1 个失败，其余 2 个照常成功，且结果顺序与入参一致 | 通过 |
| `orientation_swaps_axes_only_for_5_to_8` | EXIF 方向 1~8 中仅 5/6/7/8 交换宽高 | 通过 |
| `error::heic_error_is_actionable` | HEIC 错误必须带可执行建议 | 通过 |
| `error::io_error_maps_to_io_code` | IO 错误码映射 | 通过 |

### 构建与启动

| 检查项 | 结果 |
| --- | --- |
| TypeScript / ESLint | 0 错误 |
| 前端用例 | 44 通过（未回退） |
| Rust 用例 | 10 通过 |
| release 构建 | 2 分 43 秒，产出 `pintu.exe` |
| 启动 | 进程存活（26,704 K），对话框插件初始化无崩溃 |

> 构建通过同时说明 `capabilities/default.json` 中的 `dialog:allow-open` / `dialog:allow-ask` 权限标识被 Tauri 校验接纳（非法权限会在构建期报错）。

### 未测试项（不得视为通过）

| 项 | 原因 | 归属 |
| --- | --- | --- |
| 点击"导入图片"后的完整交互 | 需要真实 GUI 点击与文件选择，当前无法自动化 | 人工验证，见 `docs/KNOWN_ISSUES.md` KI-07 |
| 拖放导入 | 未实现 | T2.2 |
| 剪贴板 `Ctrl+V` 导入 | 未实现 | T2.3 |
| 50 张图片导入耗时 | 未做压力场景 | T12.3 |

---

## TR-06 已知问题与风险

| 编号 | 问题 | 影响 | 处理 |
| --- | --- | --- | --- |
| ~~KI-01~~ | ~~`image` 默认 feature 全开~~ | — | **已解决**：T0.15 裁剪为四格式，见 TR-02 |
| KI-02 | `fast_image_resize` 已在依赖中但本阶段未使用 | 无功能影响 | T0.9 导出原型中启用并记录实际重采样耗时 |
| KI-03 | 探测工程位于 `C:\TEMPs\_probe_img` 与 `C:\TEMPs\_probe_tauri` | 占用磁盘（含两套 cargo target） | P1 正式工程建立后删除 |
| KI-04 | T0.14 基准测得的是"入队耗时"而非"光栅化耗时" | 易被误读为性能极佳 | 已在 TR-03 明示；精确数字改用 Chrome Tracing（T3.7） |

---

## TR-07 尚未执行的测试（标记为未测试，不代表通过）

基线 §16 清单中以下项当前状态为 **未测试**：环境与打包类（T0.7 WebView2 部署方式）、20,000 px 导出（T0.9）、交互与数据生命周期类（P2 之后）、导出与压力类（P10 之后）、安装/卸载（T12.7）。
