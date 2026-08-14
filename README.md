# Palab — 下落式音游（Phigros 风格）

Palab 是一款基于 Web 技术构建的下落式（VSRG）节奏游戏，UI 与玩法深受 Phigros 启发。支持自定义谱面导入、实时打击判定、RKS 评分系统、FC/AP 目标模式，以及完整的开发者参数调校面板。

## 技术栈

React 18 + TypeScript · Vite 6 · Canvas 2D（预生成模糊背景）· Web Audio API（低延迟打击音效）· IndexedDB（谱面持久化存储）· Capacitor 8（Android APK 打包）· JSZip（谱面包导入/导出）

## 快速开始

```bash
npm install
npm run dev          # 开发模式 → http://localhost:5173
npm run build        # 生产构建 → dist/
npm run preview      # 预览生产构建
```

## 构建 Android APK

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# APK → android/app/build/outputs/apk/debug/app-debug.apk
```

> 需要 JDK 21+ 与 Android SDK。`capacitor.config.ts` 中可配置包名等信息。

## 项目结构

```
src/
  components/     # React UI 组件
    GamePlay.tsx       # 游戏主画面（触控、特效、暂停、FC/AP 目标）
    ChartLibrary.tsx   # 谱面库（导入、详情、流速/镜像/目标设置）
    ResultsScreen.tsx  # 结算界面（RKS、评级、看板娘台词）
    DevPanel.tsx       # 开发者面板（130+ 可调参数，8 个 Tab）
    MainMenu.tsx       # 主菜单
    SettingsPanel.tsx  # 设置
    ...
  hooks/
    useGameEngine.ts   # 游戏核心循环（R AF、判定、Hold、宽恕窗口）
    useInput.ts        # 键盘输入映射
  utils/
    scoring.ts         # 判定逻辑、计分、RKS 计算
    devOverrides.ts    # 开发者参数覆盖系统（localStorage 持久化）
    blurImage.ts       # Canvas 离线模糊背景生成
    chartDB.ts         # IndexedDB 谱面存储
    audioManager.ts    # Web Audio API 音频管理
    chartGenerator.ts  # 自动谱面生成算法
    zipSave.ts         # 跨平台 ZIP 保存（Capacitor Filesystem + file-saver）
  styles/
    global.css         # ~6500 行全局样式
  types/
    index.ts           # 类型定义（GameConfig、Note、AppSettings…）
public/
  14.png              # 看板娘角色图
  tab.ogg             # 打击音效
```

## 核心特性

- **打击引擎**：Web Audio API 预加载打击音效 BufferSource，预建 GainNode 节点池，移动端 AudioContext 自动 resume，最低延迟打击反馈。支持 Hold 长条松手宽恕窗口。
- **RKS 评分**：对标 Phigros 的 Ranking Score 系统，Top 20 最佳单曲 RKS 加权平均，结算界面实时显示 RKS 变化。
- **FC/AP 目标模式**：谱面库设置目标后，失误自动触发 ⟳ 弹跳动画并无加载重启，上次失误音符高亮红色提示。
- **谱面系统**：ZIP 导入/导出，IndexedDB 持久化，支持镜像翻转、自动演奏、流速调节。**基于 Meyda 音频节拍检测的全自动谱面生成**——上传任意 mp3/wav/ogg，算法分析 BPM、onset 能量峰与频谱包络，自动铺设 tap/hold/double 音符，难度曲线由定数参数驱动。
- **开发者面板**：130+ 可调参数覆盖判定窗口、音符物理、计分权重、特效、UI 布局、性能开关，参数实时生效并 localStorage 持久化。含无敌娱乐模式。
- **看板娘 Papori**：结算界面根据 RKS/评级弹出数据驱动的俏皮台词或评价，含外部链接。
- **移动端适配**：Capacitor 打包 Android APK，竖屏/横屏自适应布局，触控采用 Pointer Events 统一鼠标+多点触控，GPU 加速音符渲染。

## 许可证

本项目采用 **GNU General Public License v3.0（GPL-3.0）** 开源许可。

你可以自由使用、修改和分发本项目，但**以任何形式分发（包括修改后的版本）时必须开源并保持相同的 GPL-3.0 许可**。完整条款见 [LICENSE](./LICENSE)。

> 说明：项目依赖的第三方库（React、Vite 等）各自遵循其自身的开源许可（多为 MIT / BSD），GPL-3.0 仅约束本项目自身的代码。
