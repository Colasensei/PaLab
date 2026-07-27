# Palab 文件格式文档

> 最后更新：2026-07-26 | 版本 0.3.5

---

## 1. 谱面 Zip 包格式

谱面以 `.zip` 格式导出/导入，包含以下文件：

```
chart-name.zip
├── info.json          # 元信息
├── chart.json         # 音符数据
├── song.mp3           # 音频文件（或其他格式）
├── cover.png          # 封面图片（可选）
└── illustration.png   # 曲绘/背景图（可选）
```

### 1.1 `info.json`

```json
{
  "title": "Song Title",
  "artist": "Artist Name",
  "author": "Chart Author",
  "difficulty": "HD",
  "chartConstant": 12.5,
  "description": "Optional description",
  "config": {
    "bpm": 174,
    "trackCount": 4,
    "chartConstant": 12.5,
    "speed": 5.0
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 歌曲标题 |
| `artist` | string | 否 | 曲师 |
| `author` | string | 否 | 谱师 |
| `difficulty` | string | 是 | 难度标签（EZ/NM/HD/IN/AT） |
| `chartConstant` | number | 是 | 谱面定数（1.0~18.0） |
| `description` | string | 否 | 谱面描述 |
| `config.bpm` | number | 是 | BPM |
| `config.trackCount` | number | 是 | 轨道数（2/4/6/8） |
| `config.chartConstant` | number | 是 | 同顶层 chartConstant |
| `config.speed` | number | 否 | 流速倍率（默认 5.0） |

### 1.2 `chart.json`

音符数组，每个元素对应一个音符：

```json
[
  {
    "id": 0,
    "type": "tap",
    "track": 0,
    "startTime": 500,
    "endTime": 500,
    "isDouble": false,
    "doubleGroupId": null
  },
  {
    "id": 1,
    "type": "hold",
    "track": 2,
    "startTime": 1000,
    "endTime": 2000,
    "isDouble": false,
    "doubleGroupId": null
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 唯一 ID（导出时按顺序 0, 1, 2...） |
| `type` | `"tap"` \| `"hold"` | 音符类型 |
| `track` | number | 轨道索引（0-based，0 = 最左） |
| `startTime` | number | 起始时间（ms） |
| `endTime` | number | 结束时间（ms），tap 时等于 startTime |
| `isDouble` | boolean | 是否为多押音符 |
| `doubleGroupId` | number \| null | 多押组 ID |

### 1.3 音频文件

- 文件名格式：`song.<ext>`，`<ext>` 为原始文件扩展名（mp3/wav/ogg 等）
- 导入时 Zip 包中 `song.*` 的第一个匹配文件即为音频
- 不支持多个音频文件

### 1.4 图片文件

| 文件名 | 用途 | 必填 |
|--------|------|------|
| `cover.png` | 封面（列表缩略图、加载界面右上角方块） | 否 |
| `illustration.png` | 曲绘/背景（游戏中模糊背景） | 否 |

支持的图片格式：PNG、JPEG、WebP。

### 1.5 加载逻辑

```
Zip 包导入
  → 解析 info.json（必须存在）
  → 解析 chart.json（必须存在）
  → 查找 song.* 作为音频
  → 查找 cover.png 作为封面
  → 查找 illustration.png 作为曲绘
  → chartConstant 以 chart.json 中配置值为准
```

---

## 2. localStorage 数据结构

所有持久化数据存储在 `localStorage` 中。

### 2.1 游戏记录 (`palab_history`)

```json
[
  {
    "score": 98765,
    "rating": "V",
    "perfect": 380,
    "good": 20,
    "bad": 0,
    "miss": 0,
    "maxCombo": 400,
    "pp": 11.52,
    "offsets": [12, -5, 8, ...],
    "date": "2026/7/26",
    "time": 1751452800000,
    "config": {
      "bpm": 174,
      "difficulty": "HD",
      "chartConstant": 12.5,
      "trackCount": 4,
      "speed": 5.0
    }
  }
]
```

### 2.2 谱面分数 (`palab_chart_scores`)

```json
{
  "chart-name.zip": {
    "score": 98765,
    "rating": "V",
    "rks": 11.52,
    "acc": 0.9825,
    "date": "2026/7/26"
  }
}
```

### 2.3 设置 (`palab_settings`)

用户全局设置，类型 `AppSettings`。详见代码。

### 2.4 其他 Key

| Key | 类型 | 说明 |
|-----|------|------|
| `palab_rks` | number | 综合 RKS 值 |
| `palab_profile` | `AccountInfo` | 用户个人信息（昵称+头像） |
| `palab_eula` | `"1"` | EULA 已接受标记 |
| `palab_playtime` | number | 累计游玩时长（ms） |
| `palab_dev_overrides` | `DevOverrides` | 开发者参数覆盖 |
| `palab_assets` | object | 自定义素材（`assetStore.ts`） |

---

## 3. 谱面列表缓存

谱面库（ChartLibrary）在应用启动时加载：

```
localStorage['palab_charts'] → ChartPackage[]
  → 每个包展开 info.json 的元信息
  → 封面/曲绘使用 blob URL（从 Zip 中提取）
```

谱面库数据不在此文档详述，参见 `src/utils/chartDB.ts`。

---

## 4. 版本信息

| 文件 | 说明 |
|------|------|
| `package.json` | 项目版本（`version` 字段） |
| `public/version.json` | 前端可读取的版本号 |
| `AboutScreen.tsx` | 关于页面显示的版本 |
| `HelpScreen.tsx` | 帮助页面显示的版本（中+英） |

**版本号同步铁律：** 以上 4 处必须一致。
