# Palab 项目 AI 开发指南

> 当前版本：**0.5.8 (Alpha 5.8)** | 2026-08-01
> **每次改动前必须阅读本文件。**

---

## 0. 铁律

### 0.0 每次改动前先读 AGENT.md
所有设计决策、UI 规范、多语言要求均在此文件。违反即返工。

### 0.1 全局禁用 Emoji
禁止任何带颜色的 emoji 表情。允许 Unicode 基础符号（✓ ✕ ▶ ← → — 等纯文本）。

### 0.2 黑白设计语言
**全局统一黑白灰配色**。按钮、标签、进度条等全部黑白灰 + 半透明。难度**标签文字**统一用白色/灰色，但难度**方形徽章底色**可沿用 EZ/NM/HD/IN/AT 对应颜色（参考谱面库中的难度方块）。

### 0.3 禁止卡片式 UI
**不准使用 `.st-card` 式卡片**。UI 应为平坦、四四方方的矩形区域，无圆角大卡片、无阴影卡片。参考 Apple 设计语言：扁平、干净、大留白。

### 0.4 中英文多语言
所有面向用户的文本必须用 `lang === 'zh' ? '中文' : 'English'` 包裹。设置面板标签、按钮文字、提示信息无一例外。

### 0.5 UI 自适应
所有界面随屏幕尺寸和缩放自适应。使用 `clamp()`、`min()`、`vw`/`vh`、百分比布局。

### 0.6 新增控件前必须先阅读当前页面全部风格
**在已有界面新增任何按钮/滑块/控件之前，必须完整阅读该页面所有现有控件的样式。** 新增控件必须与现有控件保持一致的：
- 高度、padding、border-radius
- 字体大小、字间距、颜色
- 背景/边框风格（若主按钮是白底黑字，次要按钮也要协调，不能一个圆角一个直角）
- 对齐方式（同一行内所有控件必须同高同基线）

### 0.7 设计新界面时参考已有设置选项
- 设置面板中的开关和滑块是 UI 设计的参考基准（间距、字号、颜色）
- **模糊效果**：`settings.uiBlur` 控制全局模糊
  - 若 `uiBlur === true`：使用实时 CSS `filter: blur()` / `backdrop-filter`
  - 若 `uiBlur === false`：用 `generateBlurredBg()` 预生成静态模糊图片，禁用 CSS 模糊
  - 加载界面和曲绘背景均遵循此规则
- 新 UI 变量必须遵循 DevPanel 中已有的开发者设置
- 按钮颜色参考：主要操作用纯白底黑字 (`background: #fff; color: #000`)，次要操作用半透明

### 0.7 大文件不进仓库
APK/EXE >50KB → `C:\Users\colas\Documents\palab\<版本>\`

### 0.7 版本号同步
`package.json` / `public/version.json` / `AboutScreen.tsx` / `HelpScreen.tsx`(中+英)

### 0.8 构建后提供 changelog

每次构建完成后，AI 必须提供本次版本的 changelog 摘要文本，供用户填入 lingyanspace 升级托管服务的 versionDes 字段

升级托管服务：
- TS Android: softwareId = `52045257433420805`
- TS Windows: softwareId = `52045545676477445`
- 文件名用点号分隔，不用横杠（`palab.0.5.0.apk` 而非 `palab-0.5.0.apk`）
- 版本号逐位比较（0.12.0 > 0.9.0）

### 0.8 正式版（1.x.x）构建前提醒关闭开发者模式

当要开始构建正式版（1.x.x）时，AI 必须提醒用户：
- 关闭设置里的开发者选项入口（devMode / DEV MODE 徽章）

### 0.9 每次对话结束时提交
每次聊天任务完成后，AI 必须将本次所有改动提交到 main 分支并推送到 GitHub：
- 提交信息用中文概括本次改了什么，不用英文
- 如果本次对话没有任何文件改动，则跳过
- 推送前需确保构建通过（`npm run build`）

```powershell
git add -A; git commit -m "<本次改了什么>"; git push origin main
```

---

## 1. 项目概览

**Palab** — Phigros 风下落式节奏游戏。纯本地化。

- React 18 + TypeScript + Vite 6
- Capacitor 8 (Android APK)
- Electron + electron-builder (Windows EXE)
- 别名 `@/` → `src/`

### 1.1 文档索引

| 文档 | 路径 | 内容 |
|------|------|------|
| **数值计算** | [`docs/math.md`](docs/math.md) | 判定窗口、ACC、PP、RKS、难度定数、Hold 规则 |
| **文件格式** | [`docs/file-formats.md`](docs/file-formats.md) | Zip 谱面包格式、localStorage 结构、版本信息 |
| **手动制作** | [`docs/manual-chart.md`](docs/manual-chart.md) | 手动录入谱面完整教程 |
| **Agent 指南** | `Agent.md` | 本文件 — 开发规范、UI 铁律、项目架构 |

## 2. 核心路径

| 用途 | 路径 |
|------|------|
| 项目根 | `C:\Users\colas\Documents\code\PaLab` |
| 构建归档 | `C:\Users\colas\Documents\palab\<ver>\` |
| JDK 21 (APK) | `C:\Program Files\BellSoft\LibericaJDK-21\` |
| Electron 临时 | `%TEMP%\palab-electron-build\` |
| 公共资源 | `public/` (14.png, tab.ogg, 审判曲？.mp3, icon.ico) |

## 3. UI 规范

- **顶栏**：`App.tsx` 自带 Logo+返回，禁止单独页面再设计
- **配色**：全局黑白灰，`--text-primary: #EEE`、`--text-secondary: rgba(255,255,255,0.45)`
- **禁止**：卡片 `.st-card`、难度颜色、大圆角、阴影卡片
- **允许**：扁平矩形、细线分隔、大留白、`border-radius: 4-8px`
- **返回键**：纯文字「返回 / Back」
- **SongPanel / ChartLibrary**：必须有设置按钮，导航遵循"从哪里来回哪里去"
- **滑块**：简洁白色细线轨道 + 白色圆形拖动点

## 4. 设置面板

```
设置
├── 语言
├── 开关组 (双押/ACC/可视化/UI模糊/音符大小/开发者)
├── [素材修复] → 看板娘立绘 + 打击音效 + 延迟校准曲 (3项)
├── [个性化] → Tap贴图 + Hold贴图
├── [谱面延时] → 输入延迟(空格/点击) + 音乐延迟(播放校准曲)
├── [音量] → 音乐音量 + 打击音量 (默认50%)
└── [保存]
```

### 延迟校准说明
- **输入延迟**：测量手指/键盘到系统的延迟。用户跟随节拍按空格/点击，系统计算偏差。
- **音乐延迟**：测量音频输出延迟。播放 BPM 164 的校准曲，模拟下落，用户调整偏移。
- 算法：12 次采样，去掉最大 2 + 最小 2 个离群值，剩余取平均。
- 每种模式必须有「归零」按钮。

## 5. 加载界面

> 详见 [§8 加载界面（已封装）](#8-加载界面已封装) — 完整的 API 文档、组件说明和使用示例。

## 6. 构建

```powershell
npm run build
npx cap sync android
cd android; $env:JAVA_HOME='C:\Program Files\BellSoft\LibericaJDK-21'; .\gradlew.bat assembleRelease
npx electron-builder --win --x64 --config.directories.output='C:/Users/colas/AppData/Local/Temp/palab-electron-build'
```

## 7. 关键功能

- **暂停**：双击 400ms、ESC 双按
- **素材存储**：`assetStore.ts` localStorage + `ASSET_KEYS`
- **音符贴图**：Tap `contain`、Hold `100% 100%`，贴图去 outline
- **音量默认**：50%
- **无卡片 UI**：所有界面平坦矩形

## 8. 加载界面（已封装）

加载系统分为三层，从底层到高层：

| 层级 | 文件 | 用途 |
|------|------|------|
| 工具函数 | `src/utils/loading.ts` | `runWithLoading()` 核心计时+任务逻辑 |
| 全屏组件 | `src/components/LoadingScreen.tsx` | App 级 Screen 系统内的全屏加载 |
| 通用遮罩 | `src/components/LoadingOverlay.tsx` | 任意组件内可用的 fixed 遮罩 |
| React Hook | `src/hooks/useLoading.tsx` | 命令式 API，`await startLoading(...)` |

### 8.1 核心工具：`runWithLoading` (`src/utils/loading.ts`)

```ts
import { runWithLoading } from '@/utils/loading';

// 假加载：仅等待 2.5~4s
await runWithLoading();

// 实加载：等待任务完成 + 最小时长，取较长者
await runWithLoading(async () => {
  await audioManager.load(url);
});

// 自定义时长
await runWithLoading(task, 3000, 1000); // 3~4s
```

- **`task`**：可选 async 函数，与计时器并行执行。任务失败不阻塞加载流程（仅 `console.warn`）。
- **`minMs`**：最小时长，默认 `2500`
- **`varianceMs`**：随机浮动，默认 `1500`
- 加载完成 = `max(task耗时, 随机时长)`。两个都完成后 resolve。

### 8.2 全屏组件：`LoadingScreen` (`src/components/LoadingScreen.tsx`)

**Props（新增 `task` / `minDuration`）：**

| Prop | 类型 | 说明 |
|------|------|------|
| `onComplete` | `() => void` | 加载完成后回调 |
| `lang` | `Lang` | 当前语言 |
| `uiBlur` | `boolean?` | CSS 模糊（默认 true），false 时用静态预生成图 |
| `chartInfo` | `object?` | 歌曲信息。传 `null` 时隐藏封面方块和歌名 |
| `coverOverride` | `string?` | 手动背景图 URL |
| `pageTitle` | `string?` | 标题（如"谱面库"），覆盖默认"自由模式" |
| **`task`** | **`() => Promise<void>?`** | **NEW** 后台异步任务，与计时并行 |
| **`minDuration`** | **`number?`** | **NEW** 最小时长 ms（默认 2500） |

**视觉布局（不变）：**
- 全屏模糊背景（`blur(15px) brightness(0.5)`）+ 压暗遮罩（`rgba(0,0,0,0.18)`）
- 右上角：封面方块（chartInfo 非空时）
- 左侧：歌名/曲师/难度 或 pageTitle
- 左下角：随机 TIP
- 右下角：LOADING 白条循环动画

**两种使用场景：**

| 场景 | chartInfo | coverOverride | pageTitle | task |
|------|-----------|---------------|-----------|------|
| 游戏加载 | 歌曲信息 | 无 | 无 | 音频预加载（可选） |
| 页面跳转 | `null` | 随机封面 | "谱面库"等 | 无（假加载） |

### 8.3 通用遮罩：`LoadingOverlay` (`src/components/LoadingOverlay.tsx`)

独立于 App 级 Screen 系统的 fixed 遮罩，可在任意组件内渲染。

```tsx
import { LoadingOverlay } from '@/components/LoadingOverlay';

// 基础用法
<LoadingOverlay lang={lang} pageTitle="加载中..." onComplete={done} />

// 带后台任务
<LoadingOverlay
  lang={lang}
  pageTitle="正在处理..."
  bgImage={someCoverUrl}
  task={async () => { await heavyWork(); }}
  minDuration={1500}
  onComplete={done}
/>
```

**Props：** `onComplete`, `lang`, `pageTitle?`, `bgImage?`, `task?`, `minDuration?`

视觉风格与 `LoadingScreen` 一致（模糊背景 + TIP + LOADING 动画），但不含封面方块和歌曲信息。

### 8.4 Hook：`useLoading` (`src/hooks/useLoading.tsx`)

命令式 API，适合在事件处理中触发加载：

```tsx
import { useLoading } from '@/hooks/useLoading';

const { loading, LoadingUI, startLoading } = useLoading({ lang });

// 在 JSX 中放置（建议在 return 顶层）
return (
  <>
    {loading && <LoadingUI pageTitle="加载中..." bgImage={bg} />}
    {/* 页面内容 */}
  </>
);

// 在事件处理中触发
const handleClick = async () => {
  await startLoading({
    pageTitle: '正在处理...',
    task: async () => { await doSomething(); },
    minDuration: 2000,
  });
  // 加载完成，继续后续
};
```

`startLoading()` 返回 `Promise<void>`，完成后自动 resolve。

### 8.5 App.tsx 中的集成

**页面跳转加载（page-loading）：**
```tsx
// navigateTo / navigateBack 检测 PAGE_LOAD_TARGETS
// → 渲染 LoadingScreen（无 task，纯假加载）
case 'page-loading':
  return <LoadingScreen onComplete={handlePageLoadingComplete} lang={lang}
    chartInfo={null} uiBlur={settings.uiBlur}
    coverOverride={pageLoadingBg} pageTitle={pageLoadingLabel} />;
```

**游戏加载（loading）：**
```tsx
// handleStart / handleRestart 设置 loadingTaskRef
// → LoadingScreen 带 task（音频预加载）
case 'loading':
  return <LoadingScreen onComplete={handleLoadingComplete} lang={lang}
    chartInfo={chartSource} uiBlur={settings.uiBlur}
    task={loadingTaskRef.current} />;
```

`loadingTaskRef` 由 `handleStart` / `handleRestart` 在导航前设置：
- 有歌曲 URL → 后台加载音频（`audioManager.load()`）
- 无歌曲 → `undefined`（纯定时假加载）

### 8.6 页面加载目标

```ts
const PAGE_LOAD_TARGETS: AppScreen[] = ['chart-library', 'config', 'editor'];
```

进入/离开这些页面时展示加载动画。通过设置 `noPageLoading` 可跳过。

### 8.7 Tips 系统 (`src/utils/tips.ts`)

- **随机算法**：Fisher-Yates 洗牌循环——用完整个池子才重新洗牌，不会连续重复
- **分类**：纯代码笑话、音游梗、音游调侃、正常建议、Papori 的话
- **Papori 角色**：参见 `PAPORI.md`。语气元气带 `～`，偶尔毒舌分析，底色温暖

### 8.8 Papori 结算台词 (`ResultsScreen.tsx`)

- `mascotMsg` 根据成绩动态选择（AP/FC/ACC/Miss/PP 等条件，20+ 条分支）
- AP："龙币！！" + "你是神"
- FC："全连！Papori 开心转圈圈"
- PP≥13："倒吸一口凉气"
- C 评级或 PP<3："杂鱼～" + eatkano 链接
- 还有大量随机鼓励台词

### 8.9 模糊效果修正历史

| 版本 | 亮度 | 遮罩 | 模糊 |
|------|------|------|------|
| 最初 | `brightness(0.18)` | `rgba(0,0,0,0.45)` | - |
| 第一次调浅 | `0.35` | `0.3` | - |
| 当前 | `0.5` | `0.18` | `blur(15px)` |

---

## 9. 手动制作谱面

主菜单点击「制作谱面」→ 模式选择页（自动分析 / 手动制作）。

### 9.1 流程概览

```
主菜单 → ChartModeSelect → 自动分析 → ConfigPanel (原流程)
                          → 手动制作 → ManualConfig → ManualRecord → ManualAnalyzer → ChartEditor
```

### 9.2 模式选择：`ChartModeSelect` (`src/components/ChartModeSelect.tsx`)

两个大按钮：
- **自动分析**：跳转原 `ConfigPanel`（AI 生成谱面）
- **手动制作**：跳转 `ManualConfig`（跟随节拍录入）

### 9.3 歌曲设置：`ManualConfig` (`src/components/ManualConfig.tsx`)

与 `ConfigPanel` 类似但**没有难度选择**：
- 选择音频文件 → 自动分析 BPM
- 选择轨道数（2K/4K/6K/8K）
- 点击「开始录入」→ 进入录制界面

### 9.4 录制界面：`ManualRecord` (`src/components/ManualRecord.tsx`)

**状态机：** ready → recording → finished

**ready 阶段：**
- 显示按键预览
- 点击「开始」→ 音乐播放 + 录制开始

**recording 阶段：**
- 按键盘对应按键（如 D/F/J/K for 4K）或点击屏幕按键
- 短按 = Tap，长按 >120ms = Hold
- 顶栏显示进度条、时间、音符计数
- ESC / 退出按钮 → 弹窗确认退出（数据丢失）
- 「完成」按钮 → 提前结束录制
- 音乐播完自动结束
- **不支持暂停**（按规范要求）

**技术细节：**
- 使用 `performance.now()` 记录时间戳
- `requestAnimationFrame` 驱动进度更新
- 自动截断 >2s 的 Hold
- 鼠标离开按键时自动松手防卡键

### 9.5 分析工具：`manualAnalyzer` (`src/utils/manualAnalyzer.ts`)

`analyzeManualNotes(rawNotes, bpm, durationMs, trackCount)` 执行三步分析：

**1. 节拍对齐 (`alignToBeat`)**
- 基于 BPM 生成半拍网格（beatInterval / 2）
- 每个音符吸附到最近网格点
- 偏差 > 0.38 拍的音符保持原位（尊重用户意图）

**2. 双押识别 (`detectDoubles`)**
- 时间差 ≤ 35ms 的多个音符 → 标记为同一多押组
- 设置 `isDouble: true` 和 `doubleGroupId`

**3. 难度评定 (`estimateDifficulty`)**
- 基于 NPS（音符密度）、双押比例、Hold 比例、峰值密度
- 轨道数补偿（4K 基准）
- 输出 chartConstant (1.0~18.0)

### 9.6 分析界面：`ManualAnalyzer` (`src/components/ManualAnalyzer.tsx`)

展示分析进度（3 步动画），完成后跳转 ChartEditor。

### 9.7 编辑与保存

分析完成后进入 `ChartEditor`，与自动分析流程完全相同：
- 编辑标题、曲师、作者、封面、曲绘
- 导出为 `.zip`（info.json + chart.json + song.mp3 + cover.png + illustration.png）

### 9.8 App.tsx 关键状态

| 状态 | 类型 | 说明 |
|------|------|------|
| `manualConfig` | `GameConfig \| null` | 手动制作的配置（歌曲、BPM、轨道数） |
| `manualRawNotes` | `Note[]` | 录制的原始音符 |
| `manualDuration` | `number` | 歌曲时长 ms |

**导航处理：**
- `manual-record` / `manual-analyze` 返回时跳回 `chart-mode-select`
- 录制中退出会先停止音频（`audioManager.stop()`）