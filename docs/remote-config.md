# Palab · 云控配置设计

> 版本 0.2（草案）| 2026-10-17
> 相关：[`lingyanspace.md`](lingyanspace.md)（接口与 CORS）、[`math.md`](math.md)（判定与计分参数）

---

## 1. 目标与边界

**目标**：不发版就能改的东西，走云控。改一条记录，下次启动生效。

- 功能开关（某个新界面开了还是关着）
- 数值调参（判定窗口、定数上限、计分权重之类）
- 设置项的默认值（新玩家的初始值）
- 面向玩家的文案

**原则：键空间尽可能大，校验尽可能通用。** 不做手写白名单——可云控的键集直接从现有代码里**自动派生**（见第 5 节），以后新增设置项/调参项**自动就能云控**，不需要动云控的代码。

**明确不做**：云控**不下发代码**。文件、逻辑、新界面不属于本文档范围——那是 OTA 热更新的事，另开文档。参数的好处是**秒级生效、零下载、离线也能用缓存**，出紧急问题时比推代码快得多，也安全得多。

---

## 2. 为什么用 lingyanspace 就能做

lingyanspace 的"软件包"本质是一条云端键值记录，`LsPackage` 的 `versionDes` 是**任意文本**。公告系统就是拿它当正文用的，`parseChartMeta()` 甚至已经在解析 `versionDes` 里的 JSON。所以云控不需要任何服务端改动，只需要**再申请一个 softwareId**。

现成可复用的东西：

| 能力 | 位置 |
|------|------|
| 列表接口（含 CORS 智能通道、45001 空列表处理） | `getAllPackages()` — `src/utils/lingyanspace.ts` |
| 文件地址解析（本次用不到，留给将来的 bundle） | `resolveDownloadUrl()` |
| 直连/反代探测 | `useDirectLingyanspace()` |
| **调参键集 + 类型表 + 内置默认值** | `DEFAULT_OVERRIDES` — `src/utils/devOverrides.ts:414`（约 160 键） |
| **设置键集 + 类型表 + 内置默认值** | `DEFAULT_SETTINGS` — `src/types/index.ts:273`（55 字段） |
| 拉取时机先例 | `src/App.tsx` 中 EULA 同意后拉公告的那段 `useEffect` |

---

## 3. 发布端约定（在 lingyanspace 后台怎么发）

- **softwareId**：新建一个专用项（记为 `SW_REMOTE_CONFIG`，具体 ID 申请后填入）。
- **只放 1 条 `release`** = 当前生效的配置；其余一律 `beta`，当草稿、灰度和历史。这条约定和公告系统完全一致。
- **`versionNum`**：配置版本标识，建议 `cfg.YYYY.MM.DD.N`。
- **`versionDes`**：JSON 正文（唯一载荷）。
- **`fileUrl`**：配置**不用**，保持空。
- **`createTimeStamp`**：**这个字段有语义**——它被当作"这条配置的改动时间"，参与第 6 节的冲突判定。发布即代表"我改了这个键"。

**每次只下发你刻意要控的键**，不要整份铺开。键空间大不等于每次都要全发。

---

## 4. 数据格式

```json
{
  "schema": 1,
  "minShell": "0.7.7",
  "killSwitch": false,
  "flags": {
    "wheelPicker": false,
    "newResultsScreen": true
  },
  "tuning": {
    "j_timeB": 80,
    "j_timeA": 160,
    "j_timeC": 280
  },
  "defaults": {
    "speed": 5.0,
    "noteScale": 1.0
  },
  "events": {
    "judgeForce": "perfect"
  },
  "note": {
    "zh": "愚人节快乐：今天所有判定都是 Perfect，成绩不计入记录",
    "en": "April Fools: every judgment is Perfect today. Scores are not recorded."
  }
}
```

| 字段 | 作用 |
|------|------|
| `schema` | 格式版本。**不等于客户端支持的版本就整条丢弃** |
| `minShell` | 低于这个壳版本的客户端拒绝应用 |
| `killSwitch` | 见第 13 节 |
| `flags` | 功能开关，键集来自代码里的注册表 |
| `tuning` | 调参，键空间 = `DEFAULT_OVERRIDES` 的全部键 |
| `defaults` | 设置项，键空间 = `DEFAULT_SETTINGS` 的全部字段 |
| `events` | 活动/整活开关，键集来自第 10.4 节的注册表 |
| `note` | **本次改动的说明**，决定弹什么通知，见第 8 节 |

### 4.1 `note` 的三态（决定通知文案）

| 写法 | 行为 |
|------|------|
| `"note": { "zh": "…", "en": "…" }` | **用你写的这段**作为通知正文 |
| `"note": "愚人节快乐"` | 中英同文，也算"留了内容" |
| 不写 `note` 字段 | **由系统自动生成**：列出本次真正改动的「展示名：旧值 → 新值」，`tuning` 的改动归并成一行 |
| `"note": null` | **不显示通知**。用于纯技术性调整，或你确认不需要打扰玩家时 |

区分"没写"和"写了 null"靠的是 `'note' in payload`——`JSON.parse` 对缺省键给 `undefined`，对显式 null 给 `null`，两者不能混为一谈。**默认行为是"给内容"或"自动生成"，只有明确写 null 才完全静默。**

> 原来的 `message` 字段已被 `note` 取代，不要再用两套机制。

`schema` 和 `minShell` 是**向前兼容**的关键：老客户端拉到将来格式的配置会整条丢弃，而不是"只理解一半"。

---

## 5. 键空间自动派生（"尽可能通用"的核心）

不维护手写白名单。三个分区各自从代码里现成的对象派生键集和类型：

| 分区 | 键集来源 | 类型来源 | 规模 |
|------|----------|----------|------|
| `tuning.*` | `Object.keys(DEFAULT_OVERRIDES)` | `typeof DEFAULT_OVERRIDES[k]` | 约 160 |
| `defaults.*` | `Object.keys(DEFAULT_SETTINGS)` | `typeof DEFAULT_SETTINGS[k]` | 55 |
| `flags.*` | `registerFlag(name, default)` 注册表 | 注册时的默认值 | 按需 |

效果：**以后新增任何一个设置项或调参项，它自动就可云控**，云控这边一行代码都不用改。`flags` 之所以需要注册，是因为开关必须在代码里被显式读取，注册处顺手就是默认值，不存在遗漏。

---

## 6. 冲突规则：同级，后来者覆盖（LWW）

**`开发者设置 >= 云控`** —— 两者同级，**谁后改谁生效**。举个你给的例子：

| 时刻 | 动作 | 生效值 |
|------|------|--------|
| 10:00 | 我在开发者设置里把判定窗口改成 90 | 90 |
| 10:05 | 云控下发判定窗口 = 80 | 80（云控更新） |
| 10:10 | 我又在开发者设置里改成 100 | 100（我更新） |
| 10:15 | 云控再次下发 = 80 | 80（云控更新） |

实现方式是**每键时间戳**：

```ts
// localStorage['palab_cloud_meta'] —— 只记"谁在什么时候改的"，值本身仍存在原处
{ "j_timeB": { ts: 1760000000000, src: 'dev' | 'remote' } }
```

- **本地改动**：开发者在开发者面板改 `tuning` 键 → `ts = Date.now()`，`src = 'dev'`；玩家在设置面板改 `defaults` 键 → 同理记为本地改动。
- **云控下发**：`ts = 配置的 createTimeStamp`，`src = 'remote'`。
- **写入条件**：`新 ts > 已记录 ts` 才覆盖；否则忽略该键。

为什么用**配置的 `createTimeStamp`** 而不是拉取时刻：客户端每次启动都会重新拉到同一份配置。如果按拉取时刻算，云控会在每次启动时都"赢一次"，你昨天的改动会被悄悄顶掉。用发布时刻，同一条配置永远不会再次覆盖比它更新的本地改动。

**值统一存在原来的地方**（`palab_dev_overrides` / `palab_settings`），云控只在时间戳更新时往里写。所以运行时读取路径完全不变，没有第二套取值逻辑。

### 两个必须提醒的后果

1. **玩家的设置会被云控悄悄改掉**——这正是你要的规则。所以云控每次**只下发刻意要控的键**。另外建议在设置面板里给被云控改过的项加一个「云端」小标记，别让玩家莫名其妙。
2. **依赖客户端时钟**。时间戳是服务端给的，正常情况没问题；但设备时钟严重错乱时判断会出错。应对：只认"严格更新"，并记住上次生效的云控时间戳，不因同一个时间戳反复写入。

---

## 7. 校验（通用，不手写）

三层，全部自动派生：

**第 1 层——类型**：`typeof 云控值 === typeof 内置默认值`，不符就丢该键。

**第 2 层——通用守卫**（自动覆盖全部键，不用手写）：

```ts
function guard(key: string, v: unknown, def: unknown): unknown | undefined {
  if (typeof v !== typeof def) return undefined;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return undefined;
    const r = EXPLICIT_RANGE[key];                       // 可选：只给"越界会出事"的键写
    if (r) return Math.min(r.max, Math.max(r.min, v));    // 越界 → clamp，不是丢弃
    if (def !== 0) {                                      // 通用数量级守卫：不准偏离默认值一个数量级以上
      const lo = Math.min(def, def / 8), hi = Math.max(def, def * 8);
      return Math.min(hi, Math.max(lo, v));
    }
    return Math.min(1e6, Math.max(-1e6, v));              // 默认值为 0：只做数量级上限
  }
  if (typeof v === 'string') {
    if (/^#[0-9a-f]{3,8}$/i.test(String(def)))            // 默认值是颜色 → 只收颜色
      return /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined;
    const e = EXPLICIT_ENUM[key];                         // 可选：联合类型（如 language）必须显式列
    if (e) return e.includes(v) ? v : undefined;
    return v.length <= 200 ? v : undefined;
  }
  return v;
}
```

**第 3 层——不变量自检**（跨键，合并后跑一次，不满足则**整条丢弃**）：

```ts
const INVARIANTS: ((o: Merged) => boolean)[] = [
  o => o.j_timeB <= o.j_timeA && o.j_timeA <= o.j_timeC,
  o => o.s_maxScore > 0,
  o => o.h_releaseRatio >= 0 && o.h_releaseRatio <= 1,
];
```

跨键矛盾说明这份配置整体不可信，此时**不用它**，而不是退化成内置默认——避免出现"一半云控一半默认"的诡异状态。

**必须显式写范围的几类键**（数量级守卫覆盖不到）：

| 类别 | 原因 |
|------|------|
| 判定窗口 `j_*` | 越界直接毁掉手感 |
| 比值/百分比 `h_releaseRatio`、`s_perfectRatio`、`s_accGoodWeight`… | 必须在 0~1 |
| 像素/倍率 `noteScale`、`judgeLineThickness`… | 必须非负 |
| 阈值/分数 `s_maxScore`、`s_rankS`… | 必须非负 |

其余一百多个键靠第 2 层的通用守卫即可，不需要逐个写。

---

## 8. 开发者面板里的云控界面

导航路径：**开发者设置 › 云控 › 设置 › 默认值**

```
开发者设置（DevPanel，新增「云控」Tab）
└── 云控
    ├── 状态
    │   ├── 当前生效配置：版本号 / 来源（内置默认 | release | beta | killSwitch）
    │   ├── 上次拉取时间与结果（成功 / 网络失败 / 校验失败）
    │   └── 被丢弃的键清单（哪个键、被哪一条规则挡下）
    ├── 操作
    │   ├── 立即刷新
    │   ├── 重置为内置默认（清掉云控写入 + 清掉时间戳）
    │   └── 复制当前生效 JSON（改完直接贴回 lingyanspace 后台）
    └── 设置
        └── 默认值
            ├── 逐键列出：键名 | 内置值 | 云控值 | 当前生效值 | 时间戳与来源
            ├── 可本地临时改写（只影响本机，用于验证）
            └── 导出 JSON（把本机改动变成可发布的配置）
```

「默认值」这一页就是 `defaults` 分区的编辑器：改完导出 JSON、贴到后台、发一条新配置，闭环完成。`tuning` 分区本来就在开发者面板的其他 Tab 里改，不需要重复做界面。

---

## 9. 通知：云控改动必须当场告诉玩家

**硬要求**：`applyRemoteConfig()` **每真正改动一个键**，就要在当时弹出一条通知。被偷偷改掉参数是玩家最反感的事，所以必须可见。

为了不变成"只为云控写的一个弹窗"，这个通知要做成**游戏级通用通知系统**，以后所有"要告诉玩家一件事"的场景都用它。

### 9.1 命令式 API（不依赖 React 上下文）

```ts
// src/utils/notify.ts
export type NotifyLevel = 'info' | 'success' | 'warn' | 'error';

export interface NotifyAction {
  label: { zh: string; en: string };
  onClick: () => void;
  primary?: boolean;
}

export interface NotifyInput {
  id?: string;                          // 去重键
  level?: NotifyLevel;                  // 默认 info
  title?: { zh: string; en: string };
  message: { zh: string; en: string };
  detail?: { zh: string; en: string };  // 可折叠详情，长文本不撑爆
  actions?: NotifyAction[];
  duration?: number;                    // 0 = 不自动消失（有 actions 时默认 0）
  dedupe?: 'session' | 'forever' | 'none';
}

export function notify(input: NotifyInput): string;   // 返回通知 id
export function dismissNotify(id: string): void;
export function useNotifications(): Notice[];          // 只给 Host 用
```

要点：**必须是命令式的**，能在工具函数、事件回调、非组件代码里直接调，不需要 hook 或 context。实现上用一个模块级的订阅式 store（和现有 `favStore` 的 `subscribe` 模式一致）。

### 9.2 渲染

- 全局只挂**一个** `<NotificationHost />`，位置和公告弹窗同级（App 根部）。
- 视觉遵守 AGENT.md：黑白灰、扁平矩形、`border-radius 4-8px`、不用阴影卡片；中英双语由 Host 按当前语言选，**调用方只给 `{ zh, en }`**，不写三元表达式。
- 位置：桌面右下角、移动端底部；最多同时显示 3 条，其余排队。
- 默认 4 秒自动消失；带按钮的默认常驻。
- 等级只体现在左侧一条竖线的颜色（白/绿/黄/红点缀），主体仍是黑白灰。

### 9.3 云控专用规则

| 项 | 规则 |
|---|---|
| **触发** | 只在**真的改变了至少一个键**之后发。拉到了但值一模一样 → 不打扰 |
| **文案（优先级）** | 1) `note` 有内容 → 原样用它；2) `note` 缺省 → 系统自动生成「展示名：旧值 → 新值」，`tuning` 的改动归并成一行「另有 N 项技术参数调整」，最多列 3 条、其余折叠进 `detail`；3) `note: null` → **不发任何通知** |
| **按钮** | 「知道了」+「撤销本次云控」（把这条配置的时间戳记入本地黑名单，恢复改动前的值） |
| **去重** | `id = 'remote-cfg:' + createTimeStamp`，`dedupe: 'forever'`。**同一条配置只提示一次**，否则每次启动都要弹 |
| **时机** | 拉取发生在启动早期（EULA 之后），通知先入队，等主界面挂载再显示；玩家正在游玩时延后到结算或回到主界面，**不在游戏中弹** |
| **调试** | 开发者面板的云控页提供「预览通知」按钮，不用真发配置就能验证样式 |

---

## 10. 云控能改什么（清单）

键空间 = 三个自动派生分区 + 一个活动开关注册表，合计 **197 个可云控键**（169 调参 + 28 设置项），另有 `flags` 与 `events` 两个按需注册的开关表。

### 10.1 `tuning` —— 调参，169 个键，16 组

来源：`DEFAULT_OVERRIDES`（`src/utils/devOverrides.ts:414`），也就是开发者面板里能调的全部东西。

| 组 | 键数 | 前缀 | 内容 |
|----|------|------|------|
| Judgment | 6 | `j_` | 判定窗口 A/B/C、Miss 阈值、按下偏移、提前容差 |
| Hold | 4 | `h_` | 释放比例、最短长度、完成缓冲、释放宽恕 |
| Scoring | 16 | `s_` | 满分、Perfect/Good 系数、ACC 权重、RKS 公式各参数、各轨数 k 系数、S/A/B 评级线 |
| Physics | 7 | `p_` | 下落时长、判定线位置、上下留白、音符前后可见范围、裁剪、提前结束 |
| Note sizes | 14 | `n_` | 轨道宽上下限、外边距、音符尺寸/圆角、Hold 环、判定线粗细、双押圈 |
| Colors | 15 | `c_` | 音符/Hold/背景/判定线，以及 AP、V、S、A、B、C 评级色和 EZ~AT 难度色 |
| Effects | 16 | `e_` | COMBO/分数字号、双押辉光、Tap/Ring/音符淡入淡出特效、Hold 脉冲、特效回收 |
| Audio | 9 | `a_` | 打击音增益、延迟偏移、FFT、频谱可视化参数 |
| UI | 17 | `u_` | 暂停双击窗口/倒计时、开局延迟、进度条、背景模糊亮度缩放、暂停面板尺寸、K 缩写阈值 |
| Navigation | 5 | `x_` | 页面切换动画时长、层叠缩放/位移/透明度/模糊 |
| Loading | 11 | `l_` | 加载条步进、缓动指数、各阶段目标与时长 |
| Chart gen | 21 | `g_` | 自动生成难度归一、各类音符概率、最小间距、强拍/半拍倍率、四押、长条倍率、阶梯、交互、纵连 |
| Audio analysis | 11 | `aa_` | BPM 上下限、缓冲、前奏检测、网格窗口、节拍间距、阈值 |
| Difficulty | 4 | `d_` | EZ/NM/HD/IN 的定数上限 |
| Other | 10 | 混 | 开发者点击次数、试玩/结算延迟、试玩与默认时长、EULA 滚动阈值、昵称长度、头像尺寸、保存提示时长、状态节流 |
| Performance | 3 | `perf_` | 目标帧率、最大同屏音符数、音符渲染窗口 |

### 10.2 `defaults` —— 设置项，28 个字段

来源：`DEFAULT_SETTINGS`（`src/types/index.ts:273`）。

| 类别 | 字段 |
|------|------|
| 判定 / 音量 | `latencyOffset`、`judgeLineThickness`、`musicVolume`、`hitVolume` |
| 外观 | `noteColor`、`holdNoteColor`、`bgColor`、`judgeLineColor`、`skin`、`holdGradient`、`edgeTrackTint`、`noteScale` |
| 界面 | `uiScale`、`gameUiScale`、`uiBlur`、`videoBg`、`gameBgBlur`、`showMascot`、`showFPS`、`showACC`、`showAccuracyBar`、`showWaveform`、`showDoubleGlow`、`noPageLoading` |
| 性能 | `performanceMode`、`renderScale` |
| 其它 | `language`、`devMode` |

### 10.3 `flags` —— 功能开关

键集来自代码里的 `registerFlag(name, default)` 注册表。第一版建议收录：滚轮选取、新结算界面，以及任何"上线了但想留个后门关掉"的功能。

### 10.4 `events` —— 活动 / 整活开关

给愚人节、周年、联动这类临时活动用。它和 `flags` 的区别：

- `flags` = "这个功能上线了，要不要开"
- `events` = "**把游戏规则临时改掉**"

第一版建议的开关：

| 键 | 取值 | 效果 |
|----|------|------|
| `judgeForce` | `'perfect'` \| `'good'` \| `'bad'` \| `'miss'` \| `'random'` \| `null` | **不管怎么点，判定结果都是这一种**。`random` = 每次判定随机 |
| `judgeSwap` | bool | 判定对调：Perfect ↔ Miss、Good ↔ Bad |
| `judgeDowngrade` | bool | 全体降一级：P → G、G → B、B → M（"永远差一点点"） |
| `noteInvisible` | bool | 音符只在判定线附近才可见（读谱地狱） |
| `scrollReverse` | bool | 音符反向：从下往上落 / 判定线搬到顶部 |
| `judgeLineDance` | bool | 判定线随节拍上下浮动 |
| `colorInvert` | bool | 全局反色 |
| `mascotSpam` | bool | 看板娘频繁插话 |
| `forcedSpeed` | number \| null | 强制流速，忽略玩家自己的设置 |

#### 红线：`events` 一旦生效，本次游玩必须不计成绩

这和 `autoPlay` / `isTrial` 走同一套通道——**不写入最高分、不写入历史记录、不参与 RKS / PP**。成绩面板上要明确显示一个「活动模式 · 不计成绩」的标记。

理由很直接：一次愚人节活动如果把 `judgeForce` 设成 `perfect`，而成绩照常记录，那所有玩家的最高分、RKS 曲线、历史榜会被一次性污染，而且**不可逆**。这条红线不能省。

### 10.5 不用写代码就能做的整活

`tuning` + `defaults` 已经覆盖 197 个键，很多整活效果**根本不需要新功能**，直接下发就行：

| 想要的效果 | 怎么做（全用现有键） |
|------------|----------------------|
| 音符变得巨大 / 极小 | `n_tapRadius`、`n_tapHeight`、`n_holdMinH` 一起放大或缩小 |
| 音符隐身 | `c_noteColor` 改成和 `c_bgColor` 一致 |
| 全屏反色 | `c_` 开头的 15 个颜色键全部换成反色值 |
| 读谱地狱 | `u_bgBlur` 拉高 + `c_bgColor` 变亮 + `n_trackMinW` 收窄 |
| 速度极快 / 极慢 | `p_fallDuration`（下落时长，越小越快） |
| 暂停面板巨大化 | `u_pauseMaxW`、`u_pauseTitleFont`、`u_pauseCountFont` |
| COMBO 数字刷屏 | `e_comboFontSize` 拉到几百 |
| 双押辉光夸张 | `e_doubleGlowSize`、`e_doubleGlowAlpha` |
| 判定线又粗又亮 | `n_judgeLineH`、`c_judgeLineColor` |
| 加载条变得极慢 | `l_stage0DurMin` / `l_stage0DurMax`、`l_stageCount` |
| 全部谱面难度看起来变高 | `d_ezMax` / `d_nmMax` / `d_hdMax` / `d_inMax` 整体压低 |

好处是**零代码风险**：这些键本来就有上下界和校验，改坏了也只是显示难看，不会崩。

### 10.6 明确不建议云控的键

键空间是自动派生的，但下面这些要写进排除清单：

| 键 | 理由 |
|----|------|
| `defaults.latencyOffset`、`tuning.a_latencyOffset` | **玩家自己校准出来的值**。云控覆盖等于把他们的延迟校准作废，会直接毁掉手感 |
| `defaults.devMode` | 云控替玩家打开开发者模式很奇怪，而且玩家自己就能开 |
| `defaults.language` | 云控改玩家语言过于粗暴 |
| `defaults.keyBindings` | 不在 `DEFAULT_SETTINGS` 里（无法派生类型），且是嵌套结构，不适合扁平键空间 |

### 10.7 一个必须先处理的坑

`loadSettings()`（`src/App.tsx:98`）里有一段**硬编码强制覆盖**：

```ts
parsed.noteColor = '#35BFFF';
parsed.holdNoteColor = '#35BFFF';
parsed.bgColor = '#0a0a14';
parsed.judgeLineColor = '#999999';
```

这四个颜色键不管存了什么都会被顶掉，**云控改它们目前不会生效**。实现云控前要先把这段改成"只在版本迁移时覆盖一次"。

---

## 11. 兜底链（绝不能因为云控打不开）

取值顺序，任何一步失败就往下退：

```
本地值（含云控写过的）  →  localStorage 缓存的那份配置  →  内置默认值
```

- **拉取失败**（断网 / CORS / 超时）：静默使用本地已有值，**不弹窗、不打扰**（与公告的失败处理一致）。
- **解析或校验失败**：保留上一份好配置，**绝不写入坏数据**。
- **首次安装且无网**：直接用内置默认值，功能完整，只是没有云控。
- 任何云控读取都必须 `try/catch`，**不允许因为云控抛异常导致启动失败**。

---

## 12. 拉取时机与缓存

- **时机**：EULA 同意后拉一次，和公告**并行**（同一个 `useEffect`，不要串行等）。
- **缓存**：`fetch(..., { cache: 'no-store' })`，避免拿到陈旧响应。
- **去重**：`createTimeStamp` 与本地记录相同 → 整条跳过，不写不重渲染。
- **不做轮询**。运行中偷偷改参数是玩家最讨厌的行为之一；要"立刻生效"靠重启或刷新。
- **手动入口**：开发者面板的「立即刷新」和「重置为内置默认」。

---

## 13. Kill switch

出问题时必须能**不发版止血**：

1. 在 `release` 那条的 JSON 里写 `"killSwitch": true` → 客户端丢弃全部云控，回到内置默认。
2. 删掉 `release` 记录。

**推荐第 1 条**。删记录之后，客户端本地缓存里那份旧配置还在，实际**可能继续生效**，你以为停掉了其实没有。`killSwitch: true` 一定会被读到并执行。

注意：kill switch 清掉的是"云控写过的值"。如果本地后来又改过（时间戳更新），那个本地改动仍然保留——这是正确的，因为它本来就不来自云控。

---

## 14. 安全边界

- **接口公开可读**：任何人都能拉到这份 JSON。里面**不放密钥、不放未公开内容、不放带签名的直链**。
- **不信任输入**：见第 7 节，类型 + 守卫 + 不变量是唯一防线。
- **不放大影响面**：云控只能改上面三个分区的键，不能改文件系统、不能改下载源、不能改判定公式本身。

---

## 15. 失败模式与处理

| 情况 | 处理 |
|------|------|
| 网络失败 / 超时 | 用本地已有值，静默 |
| `code 45001`（无版本记录） | 视为空 → 用本地值 |
| `code` 非 20000 | 视为失败，用本地值 |
| JSON 解析失败 | 丢弃本条，保留缓存 |
| `schema` 与客户端不符 | 丢弃本条 |
| `minShell` 高于当前壳 | 丢弃本条，开发者面板记录原因 |
| 单个键类型不对 | 丢弃该键 |
| 单个键数值越界 | clamp 到边界 + `console.warn` |
| 跨键不变量不成立 | **整条丢弃** |
| `killSwitch === true` | 全部云控失效，回内置默认 |
| 该键的本地改动时间戳更新 | 忽略云控对该键的写入 |

---

## 16. 实施清单

| 文件 | 改动 |
|------|------|
| `src/utils/notify.ts`（新建） | **通用通知系统**：命令式 `notify()`、订阅式 store、去重、等级、动作按钮 |
| `src/components/NotificationHost.tsx`（新建） | 通知的渲染宿主，全局只挂一个（App 根部） |
| `src/utils/remoteConfig.ts`（新建） | 键集派生、守卫、不变量、拉取、校验、`palab_cloud_meta` 时间戳 LWW、`applyRemoteConfig()`，改动后调 `notify()` |
| `src/App.tsx` | EULA 后与公告并行拉取；`loadSettings()` 前后各接一次云控写入；挂载 `<NotificationHost />` |
| `src/utils/devOverrides.ts` | `loadDevOverrides()` 走一遍云控 LWW；开发者面板保存某个键时记本地时间戳 |
| `src/components/DevPanel.tsx` | 新增「云控」Tab（状态 / 操作 / 设置 › 默认值），沿用现有 `dp-section` 样式 |
| `src/components/SettingsPanel.tsx` | 给被云控改过的项加「云端」小标记（可选，但强烈建议） |
| `src/utils/scoring.ts` | `judgeNote()` / `judgeHoldRelease()` 出口处挂 `events` 判定覆盖钩子（`judgeForce` / `judgeSwap` / `judgeDowngrade`） |
| `src/hooks/useGameEngine.ts` | `events` 有任何一项生效 → 本局标记 `eventMode`，走不计成绩通道 |
| `src/components/ResultsScreen.tsx` | 显示「活动模式 · 不计成绩」标记 |
| `docs/lingyanspace.md` | 补一节，指向本文档 |

---

## 17. 待定问题

1. `SW_REMOTE_CONFIG` 的 softwareId（需要在 lingyanspace 后台新建）。
2. `createTimeStamp` 的确切格式（毫秒数还是日期字符串）——要在后台确认一次。
3. 第一版实际下发哪几个键。**键空间是全部，但每次下发只写你刻意要控的**，建议从判定窗口这种"错了很痛、改了很值"的开始。
4. 玩家设置被云控改掉时，设置面板要不要显示「云端」标记（我建议要）。
5. `flags` 注册表先收录哪几个开关。
6. `events` 第一版做哪几个：`judgeForce` 是确定要的，其余按 10.4 表里挑。`noteInvisible` 和 `scrollReverse` 要动渲染循环，成本比 `judgeForce` 高。
7. 活动期间是否需要在主界面/结算页常驻一个「活动进行中」的横幅，而不是只弹一次通知。
