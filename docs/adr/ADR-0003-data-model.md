# ADR-0003：画布数据模型

- 状态：**已接受**
- 日期：2026-10-27（设计）／2026-10-29（实现确认）
- 相关：`src/domain/types.ts`、`docs/ARCHITECTURE.md` §3

---

## 1. 背景

基线 §4.2 要求区分四个概念：资源库条目、画布图片实例、画布文档状态、视图状态。实现时必须选定具体结构，且该结构要能支撑撤销（快照）、模板切换（实例复用）与预览导出一致性。

## 2. 决策

### 决策一：四个概念四个类型，不合并不嵌套

```ts
LibraryItem      // 资源库条目：sourcePath 判重、importSeq 稳定排序
CanvasInstance   // 画布实例：frame/crop/rotation/flip/opacity/border/cornerRadius
DocumentState    // 文档状态：canvas + instances[] + templateId + gap + fitMode
ViewState        // 视图状态：zoom/panX/panY/selection
```

**理由**：合并会立刻产生歧义——例如把 selection 放进 DocumentState，选中变化就会进撤销历史（用户按一次 Ctrl+Z 只是取消选中，体验崩坏）。

### 决策二：图层顺序 = `instances` 数组顺序，不设 `zIndex` 字段

**理由**：`zIndex` 会出现重复值、空洞、排序后不同步三类问题；数组顺序让"拖拽排序"退化为数组移动，且快照天然保持顺序。

### 决策三：`crop` 永远相对源图像素，与旋转无关

**理由**：若 crop 随旋转变化，"旋转 90° → 裁剪 → 撤销旋转"就会破坏裁剪数据（基线 §8.3 明确要求旋转不得不可逆地重写裁剪）。

**代价**：适配裁切（`coverCrop`）必须在渲染时即时计算，且**不得回写** `crop`（见 ADR-0001 决策三与 `domain/transform.ts`）。

### 决策四：`frame` 是轴对齐显示框，旋转只作用于内容

**理由**：若 frame 随旋转交换宽高，90° 旋转会意外改变布局，用户无法预期。当前语义下"旋转改变内容朝向、外框不动"更符合拼图场景。

### 决策五：`createdSeq` 单调递增，作为模板复用的判定依据

**理由**：基线 §9.4 第 3 条要求"一个资源有多个实例时优先复用最早创建的"。用创建序号而不是时间戳，避免同毫秒创建时比较失败。

## 3. 后果

| 方面 | 影响 |
| --- | --- |
| 撤销 | DocumentState 是纯数据、可结构共享，适合快照（ADR-0004） |
| 渲染 | 需要一层 `deriveScene` 把领域模型翻译成场景描述，代价约 0.01ms/50 实例（T0.14 实测） |
| 导出 | 与预览共用 `domain/transform.ts`，语义单点 |
| 未来扩展 | 若要支持"项目文件保存"，DocumentState 可直接序列化，不需要额外转换层 |

## 4. 明确不做

- 不在 v1 引入 `zIndex` 字段
- 不把 `selection` 放进 `DocumentState`
- 不为"可能的插件"预留元数据字段（基线 §4.1 明确 v1 不做插件系统）
