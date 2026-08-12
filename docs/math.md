# Palab 数值计算文档

> 最后更新：2026-07-26 | 版本 0.3.5

本文档详述 Palab 中所有数值计算公式、参数与逻辑。所有可调参数存储在 `src/utils/devOverrides.ts` 中，通过 `getDevOverride(key)` 读取。

---

## 1. 判定窗口 (Judgment Windows)

音符判定基于按下时间与音符起始时间的偏差 `offset = pressTime - noteStartTime`（单位 ms）。

| 判定          | 条件                      | 默认窗口          |
| ----------- | ----------------------- | ------------- |
| **Perfect** | $                       | \text{offset} |
| **Good**    | $                       | \text{offset} |
| **Bad**     | $\text{offset} < 0$ 且 $ | \text{offset} |
| **Miss**    | 其他情况（太晚或未按下）            | —             |

**参数映射：**
| 参数 key | 默认值 | 说明 |
|-----------|--------|------|
| `j_timeB` | 80 | Perfect 窗口 |
| `j_timeA` | 160 | Good 窗口 |
| `j_timeC` | 280 | Bad 提前窗口 |
| `j_missThreshold` | 300 | Miss 判定延迟阈值 |

**优先级：** Perfect > Good > Bad > Miss（取最严格命中）。

**Hold 松手判定：** 按住时长 ≥ 总持时 × `h_releaseRatio`（默认 0.78 = 78%），否则视为提前松手。

---

## 2. 单音符得分 (Note Score)

总分上限 `s_maxScore` = **100,000**。

### 2.1 单音符分值

$\text{maxScorePerNote} = \frac{\text{s\_maxScore}}{\text{totalNotes}} = \frac{100,000}{N}$

### 2.2 判定倍率

| 判定      | 倍率 (`s_perfectRatio` / `s_goodRatio`) | 得分                                  |
| ------- | ------------------------------------- | ----------------------------------- |
| Perfect | 1.0                                   | $\text{maxScorePerNote} \times 1.0$ |
| Good    | 0.8                                   | $\text{maxScorePerNote} \times 0.8$ |
| Bad     | —                                     | 0                                   |
| Miss    | —                                     | 0                                   |

### 2.3 总分

$\text{Score} = \sum_{i=1}^{N} \text{noteScore}_i$

最终取整：$\text{Math.round}(\text{Score})$。

---

## 3. ACC (Accuracy)

ACC 是 Good 判定打折扣后的命中率，范围 0~1。

$\text{ACC} = \frac{P \times 1.0 + G \times w}{N}$

其中：

- $P$ = Perfect 数量
- $G$ = Good 数量
- $N$ = totalNotes
- $w$ = `s_accGoodWeight` = **0.65**（Good 权重）

**含义：** 一个 Good 相当于 0.65 个 Perfect 对 ACC 的贡献。全 Perfect → ACC = 1.0。

---

## 4. 评级 (Rating)

| 评级     | 图标          | 条件                                                       |
| ------ | ----------- | -------------------------------------------------------- |
| **AP** | All Perfect | $P = N$ 且 $G = 0$ 且 $\text{Bad} = 0$ 且 $\text{Miss} = 0$ |
| **V**  | Full Combo  | $\text{Bad} = 0$ 且 $\text{Miss} = 0$                     |
| **S**  | S           | $\text{Score} \ge 95,000$                                |
| **A**  | A           | $\text{Score} \ge 90,000$                                |
| **B**  | B           | $\text{Score} \ge 80,000$                                |
| **C**  | C           | 其余                                                       |

**参数映射：**
| 参数 key | 默认值 | 说明 |
|-----------|--------|------|
| `s_rankS` | 95,000 | S 评级门槛 |
| `s_rankA` | 90,000 | A 评级门槛 |
| `s_rankB` | 80,000 | B 评级门槛 |

---

## 5. 单曲 RKS / PP (Song Rating)

单曲 RKS（显示为 PP）衡量该次游玩的「谱面定数 × 完成度」。

### 5.1 有效定数

$ \text{effectiveConst} = \text{chartConstant} \times \text{kFactor}(\text{trackCount})$

| 轨道数 | `kFactor` key | 默认值  | 说明   |
| --- | ------------- | ---- | ---- |
| 2K  | `s_kFactor2K` | 0.35 | 大幅降低 |
| 4K  | `s_kFactor4K` | 1.00 | 基准   |
| 6K  | `s_kFactor6K` | 2.20 | 大幅提高 |
| 8K  | `s_kFactor8K` | 3.50 | 大幅提高 |

**设计意图：** 同定数下，更多轨道 = 更高难度 = 更高有效定数。X 轨道的 K 因子大致按 $\frac{X}{4}$ 的比例缩放。

### 5.2 公式

设 $A = \text{ACC}$（0~1 的小数）。

**若** $A \ge a_0$（`s_rksAccFloor` = 0.70，即 ACC ≥ 70%）：

$x = \frac{A \times 100 - 55}{45}$

$ \text{songRKS} = x^2 \times \text{effectiveConst} $

**若** $A < 0.70$：$\text{songRKS} = 0$（不达标不计分）。

**最终 PP：** $\text{PP} = \text{Math.round}(\text{songRKS} \times 100) / 100$（保留两位小数）。

**参数映射：**
| 参数 key | 默认值 | 说明 |
|-----------|--------|------|
| `s_rksAccFloor` | 0.70 | ACC 最低门槛 |
| `s_rksOffset` | 55 | 线性变换偏移 |
| `s_rksDivisor` | 45 | 线性变换除数 |

### 5.3 公式直觉

- ACC = 100% → $x = (100 - 55)/45 = 1.0$ → $\text{songRKS} = \text{effectiveConst}$
- ACC = 77.5% → $x = (77.5 - 55)/45 = 0.5$ → $\text{songRKS} = 0.25 \times \text{effectiveConst}$
- ACC = 70% → $x = (70 - 55)/45 \approx 0.333$ → $\text{songRKS} \approx 0.111 \times \text{effectiveConst}$

**核心思想：** ACC 接近 100% 时 PP 快速逼近有效定数，ACC 越低 PP 衰减越快（平方关系）。

---

## 6. 综合 RKS (Overall Rating)

RKS 是所有游玩记录的综合评分。

### 6.1 公式

$\text{RKS} = \frac{1}{K}\sum_{i=1}^{K} \text{PP}_i$

其中：

- $K$ = `s_rksTopN` = **20**（取前 20 个最高 PP）
- $\text{PP}_i$ = 第 $i$ 高的单曲 PP（过滤 PP > 0 的记录）

**显示门槛：** 需要至少 `s_rksMinRecords` = **20** 条有效记录才显示 RKS，否则显示 `--`。

### 6.2 含义

RKS 是最强 20 次游玩 PP 的平均值，类似 osu! 的 pp 系统或 Phigros 的 RKS。高定数谱面全连能显著提升 RKS。

---

## 7. 难易度系统

### 7.1 定数 → 难度标签

| 定数范围              | 难度标签   | 分界参数      | 默认值  |
| ----------------- | ------ | --------- | ---- |
| $< c_1$           | **EZ** | `d_ezMax` | 5.0  |
| $c_1 \le c < c_2$ | **NM** | `d_nmMax` | 9.0  |
| $c_2 \le c < c_3$ | **HD** | `d_hdMax` | 12.5 |
| $c_3 \le c < c_4$ | **IN** | `d_inMax` | 16.0 |
| $\ge c_4$         | **AT** | —         | —    |

### 7.2 定数范围

chartConstant 有效范围：**1.0 ~ 18.0**（普通模式）/ **0 ~ 25.0**（开发高级模式）。

---

## 8. 手动制作难度评定 (Manual Difficulty Estimation)

手动录入谱面后，系统自动评定难度。算法位于 `src/utils/manualAnalyzer.ts`。

### 8.1 输入指标

| 指标      | 符号           | 计算方式                                       |
| ------- | ------------ | ------------------------------------------ |
| 音符密度    | NPS          | $\text{notes.length} / \text{durationSec}$ |
| 峰值密度    | maxWindowNps | 1 秒滑动窗口最大音符数                               |
| 双押比例    | doubleRatio  | $\text{doubleNotes} / \text{totalNotes}$   |
| Hold 比例 | holdRatio    | $\text{holdNotes} / \text{totalNotes}$     |

### 8.2 轨道补偿

$\text{trackFactor} = \left(\frac{4}{\max(2, \text{trackCount})}\right)^{0.25}$

### 8.3 基础分（NPS → 定数，对标 Phigros）

| NPS 区间          | 公式                                                        |
| --------------- | --------------------------------------------------------- |
| $[0, 1.0]$      | $1.0 + \text{NPS} \times 2.0$                             |
| $(1.0, 3.0]$    | $3.0 + (\text{NPS} - 1.0) \times 2.5$                     |
| $(3.0, 5.0]$    | $8.0 + (\text{NPS} - 3.0) \times 1.75$                    |
| $(5.0, 8.0]$    | $11.5 + (\text{NPS} - 5.0) \times 1.5$                    |
| $(8.0, \infty)$ | $16.0 + \min(1, \frac{\text{NPS} - 8.0}{2.0}) \times 2.0$ |

$\text{baseScore} \mathrel{*}= \text{trackFactor}$

> 参考点：NPS 1→3 (EZ)，NPS 3→8 (HD)，NPS 5→11.5 (IN)，NPS 8→16 (AT)。

### 8.4 加成

| 加成项     | 公式                                             | 范围      |
| ------- | ---------------------------------------------- | ------- |
| 双押加成    | $\text{doubleRatio} \times 1.2$                | 0 ~ 1.2 |
| Hold 加成 | $\text{holdRatio} \times 0.6$                  | 0 ~ 0.6 |
| 峰值加成    | $\max(0, \text{maxWindowNps} - 8) \times 0.25$ | 0 ~ 1.0 |

$\text{chartConstant} = \text{clamp}(\text{baseScore} + \text{doubleBonus} + \text{holdBonus} + \text{peakBonus},\ 1.0,\ 18.0)$

最终保留一位小数。

> **自洽保证：** 自动生成器 (`src/utils/chartGenerator.ts`) 与手动分析器共用同一 NPS↔定数映射
> (`npsToConstant` / `constantToNps`)，因此「选定定数生成 → 丢进编辑器分析」的 round-trip 结果 ≈ 原定数。

---

## 9. BPM 与节拍

### 9.1 基础关系

$\text{beatInterval} = \frac{60,000}{\text{BPM}} \ \text{ms}$

例如 BPM 120 → 每拍 500ms，BPM 180 → 每拍 333ms。

### 9.2 节拍对齐（手动制作）

对齐窗口：$\pm 0.38 \times \text{beatInterval}$

即约 $\pm \frac{1}{3}$ 拍。超出此范围的音符保持原位不自动吸附。

### 9.3 双押识别窗口

35ms 内的多个不同轨道音符视为同一多押组。

---

## 10. Hold 长条规则

| 参数                     | 默认值    | 说明               |
| ---------------------- | ------ | ---------------- |
| `h_minLength`          | 100 ms | 最短 Hold 时长       |
| `h_releaseRatio`       | 0.78   | 松手合格比例（≥78% 即合格） |
| `h_releaseForgiveness` | 40 ms  | 松手宽恕窗口           |
| `h_completeBuffer`     | 600 ms | 自动完成缓冲           |

手动录制中：按下 > 120ms 识别为 Hold，> 2000ms 自动截断。

---

## 11. AutoPlay 与试玩

- **AutoPlay**：所有音符自动 Perfect，不计入 RKS/记录。
- **试玩模式**（有歌曲 URL 的谱面）：真人试玩会记录分数（写入历史/最佳/RKS）。
- **无敌模式**（dev override invincibleMode）：不计分。

PP 计算时 `autoPlay === true` → PP = 0。

---

## 12. 汇总速查表

| 公式             | 表达式                                                                  |
| -------------- | -------------------------------------------------------------------- |
| 单个 Perfect 得分  | $100,000 / N$                                                        |
| 单个 Good 得分     | $100,000 / N \times 0.8$                                             |
| ACC            | $(P + G \times 0.65) / N$                                            |
| 有效定数           | $\text{chartConstant} \times \text{kFactor}$                         |
| PP (ACC ≥ 70%) | $((\text{ACC} \times 100 - 55) / 45)^2 \times \text{effectiveConst}$ |
| PP (ACC < 70%) | 0                                                                    |
| RKS            | $\text{avg}(\text{top20 PP})$                                        |
| Beat 间隔 (ms)   | $60,000 / \text{BPM}$                                                |
