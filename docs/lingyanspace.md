# Palab · lingyanspace 升级托管集成文档

> 版本 0.7.1 | 2026-08-12

lingyanspace（`yarp.lingyanspace.com`）是 Palab 的升级托管服务，承载**更新检查 / 素材修复 / 谱面库社区 / 公告系统**。所有接口无 CORS 头，浏览器端（dev）必须走 Vite 代理。

---

## 1. 软件 ID 与端点

| 用途 | softwareId | API | 对应代码 |
|------|-----------|-----|----------|
| 更新检查（Android） | `52045257433420805` | `GetApplyLastPackage` | `updateChecker.ts` |
| 更新检查（Windows） | `52045545676477445` | `GetApplyLastPackage` | `updateChecker.ts` |
| 素材修复 | `52047071297934341` | `UnauthorFolder/UpgradeProxy` | `SettingsPanel.tsx` |
| **谱面库社区** | `53303667563959301` | `GetApplyAllPackages` | `lingyanspace.ts` / `CommunityPanel.tsx` |
| **公告 / 关于** | `53303754361934853` | `GetApplyAllPackages` | `lingyanspace.ts` / `AnnouncementModal.tsx` |

- 列表类接口：`/api/UpgradeServer/Upgrade/GetApplyAllPackages?softwareId=...`
- 下载类路径：`/UpgradeServer/UnauthorFolder/UpgradeProxy/<softwareId>/<applyId>/<file>`
- 返回：`code 20000` = 成功；`code 45001` = 该应用无任何版本记录（视为空列表）

---

## 2. 数据模型（`LsPackage`）

| 字段 | 说明 |
|------|------|
| `versionNum` | 版本号 / 标题（谱面名 / 公告标题） |
| `versionDes` | 版本说明 / 简介（谱面元数据 / 公告正文） |
| `fileUrl` | 下载地址（zip） |
| `fileSize` | 文件大小（字节） |
| `packageStatus` | `beta` / `release` |
| `packageType` | 包类型 |
| `downloadCount` | 下载次数 |
| `applyId` / `id` | 版本 / 应用内 ID |
| `isDeleted` | 是否已删除（拉取时过滤） |
| `createTimeStamp` | 创建时间戳 |

---

## 3. CORS 处理（关键）

lingyanspace **无 CORS 头**，浏览器直连会被拦截。方案与 `updateChecker.ts` / `SettingsPanel.tsx` 一致：
**统一走同源 `/api/*` 相对路径**，由代理转发到 lingyanspace：
- 开发：Vite 代理（`vite.config.ts`）
- 生产：部署服务器（Nginx 等）反向代理 —— 生产直连会 `failed to fetch`，必须配置反代

### 3.1 API 列表

```ts
// 统一走同源 /api/upgrade：dev= Vite 代理，生产= 服务器反向代理
const API_BASE = '/api/upgrade/GetApplyAllPackages';
```

### 3.2 文件下载（`resolveDownloadUrl`）

```ts
// 统一把 yarp.lingyanspace.com/UpgradeServer/UnauthorFolder/UpgradeProxy/<path>
// 转为 /api/unauth/<path>，由代理转发（dev= Vite，生产= 服务器反代）
export function resolveDownloadUrl(fileUrl: string | null): string | null
```

### 3.3 代理配置

开发（`vite.config.ts`）：

```
/api/upgrade  → https://yarp.lingyanspace.com/api/UpgradeServer/Upgrade   (rewrite 去前缀)
/api/unauth   → https://yarp.lingyanspace.com/UpgradeServer/UnauthorFolder/UpgradeProxy
```

生产（Nginx，云服务器必须添加，否则社区/公告/更新/素材修复全部 failed to fetch）：

```nginx
# /api/upgrade → lingyanspace 版本列表接口
location /api/upgrade/ {
  proxy_pass https://yarp.lingyanspace.com/api/UpgradeServer/Upgrade/;
  proxy_set_header Host yarp.lingyanspace.com;
  proxy_ssl_server_name on;
}
# /api/unauth → lingyanspace 文件下载
location /api/unauth/ {
  proxy_pass https://yarp.lingyanspace.com/UpgradeServer/UnauthorFolder/UpgradeProxy/;
  proxy_set_header Host yarp.lingyanspace.com;
  proxy_ssl_server_name on;
}
```

---

## 4. 谱面库社区（`CommunityPanel.tsx`）

- 拉取 `SW_CHART_LIBRARY` 全部版本 → 客户端搜索 / 难度筛选 / 排序（最新/下载最多/定数/标题）/ 分页（15/页）
- `parseChartMeta(versionDes)` 解析元数据（详见《谱面库简介编写指南》）
- 选中谱面 → `loadDetail` 下载 zip 实时解压预览（`resolveDownloadUrl` 走代理）
- 下载导入 → `parseChartZip` → 写入本地谱面库；「已拥有」用 `标题+曲师+谱师+难度` 完全匹配
- 社区打开期间（`communityOpenRef`）屏蔽谱面库选曲预览自动播放，避免音乐泄漏

---

## 5. 公告系统（`AnnouncementModal.tsx` + `App.tsx`）

- 拉取 `SW_ANNOUNCEMENT` 全部版本；`release` 置顶排序在前，`beta` 随后
- **弹窗判定**：存在未读 `release`（置顶）公告才自动弹窗；置顶已读不弹
- **黄色提示**：首页「公告」入口有未读公告时黄色 `#FFD700`
- **已读记录**：`localStorage['palab_ann_read_set']`（JSON 数组存已读 id）
- **关闭公告界面 → 全部标记已读**（打开时未读标记可见，关闭后不黄、不再弹）
- 未读条目显示黄色「未读」标；`release` 显示「置顶」徽章
- EULA 同意后才拉取并弹窗

### 公告发布约定
- 只有 **1 条**设 `release`（置顶弹窗），其余 `beta`（列表 + 黄色提示，不弹窗）
- `versionNum` = 标题、`versionDes` = 正文（支持多行）

---

## 6. 关键文件

| 文件 | 职责 |
|------|------|
| `src/utils/lingyanspace.ts` | API 封装、`parseChartMeta`、`resolveDownloadUrl`、已读存储 |
| `src/components/CommunityPanel.tsx` | 谱面库社区面板 |
| `src/components/AnnouncementModal.tsx` | 公告 / 关于界面 |
| `src/components/ChartLibrary.tsx` | 谱面库（社区入口 + 预览音频管理） |
| `src/utils/updateChecker.ts` | 更新检查 |
| `src/components/SettingsPanel.tsx` | 素材修复（`/api/unauth` 先例） |
| `docs/谱面库简介编写指南.md` | 谱面上传 / 简介格式说明 |
