# Palab 服务器部署指南

> 目标：把 Palab（纯前端静态应用）部署到云服务器，并让社区谱面库、公告、在线更新、素材修复等联网功能正常工作。
>
> **核心要点**：本项目依赖 lingyanspace 托管服务，而 lingyanspace **不返回 CORS 头**。前端统一走同源 `/api/*` 路径，由服务器反向代理转发到 lingyanspace。**如果只上传静态文件而不配置反向代理，所有联网功能都会 `failed to fetch`。**

---

## 1. 构建

在项目根目录执行：

```powershell
npm run build
```

产物在 `dist/` 目录（纯静态文件：`index.html` + `assets/` + 各素材文件）。

> 版本号相关：发版前按 AGENT.md 同步 5 处版本号 + 更新日志。

## 2. 上传静态文件

把 `dist/` 里的**所有文件**上传到服务器，例如 `/var/www/palab/`：

```bash
# 示例（服务器上创建目录后上传）
mkdir -p /var/www/palab
# 用 scp / rsync / 宝塔面板 / FTP 等把 dist/* 传到 /var/www/palab/
```

> 注意：`vite.config.ts` 里 `base: './'`，资源为相对路径，放到任意子目录也能访问。

## 3. Nginx 配置（关键）

这是让联网功能工作的**必须步骤**。以 Nginx 为例，在站点配置（如 `/etc/nginx/conf.d/palab.conf`）中：

```nginx
server {
    listen 80;
    server_name your-domain.com;          # 换成你的域名或服务器 IP

    # 前端静态文件
    root /var/www/palab;
    index index.html;

    # 单页应用：找不到文件时回退到 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ── 反向代理：版本列表接口（社区谱面库 / 公告 / 在线更新）──
    location /api/upgrade/ {
        proxy_pass https://yarp.lingyanspace.com/api/UpgradeServer/Upgrade/;
        proxy_set_header Host yarp.lingyanspace.com;
        proxy_ssl_server_name on;
    }

    # ── 反向代理：文件下载（社区谱面下载 / 素材修复）──
    location /api/unauth/ {
        proxy_pass https://yarp.lingyanspace.com/UpgradeServer/UnauthorFolder/UpgradeProxy/;
        proxy_set_header Host yarp.lingyanspace.com;
        proxy_ssl_server_name on;
    }

    # 可选：HTTPS（有证书时）
    # listen 443 ssl;
    # ssl_certificate     /path/fullchain.pem;
    # ssl_certificate_key /path/privkey.pem;
}
```

**配置说明**：
- 前端请求 `/api/upgrade/GetApplyAllPackages` → Nginx 转发为 `https://yarp.lingyanspace.com/api/UpgradeServer/Upgrade/GetApplyAllPackages`
- 前端请求 `/api/unauth/<id>/<file>` → Nginx 转发为 `https://yarp.lingyanspace.com/UpgradeServer/UnauthorFolder/UpgradeProxy/<id>/<file>`
- `proxy_pass` 末尾的 `/` 会把 `location` 前缀替换为目标路径（与 Vite 代理的 rewrite 逻辑一致）

## 4. 生效与验证

```bash
nginx -t          # 语法检查
nginx -s reload   # 重载配置
```

验证反向代理是否生效（在服务器或浏览器直接访问）：

```
# 版本列表接口（应返回 JSON，code=20000）
https://your-domain.com/api/upgrade/GetApplyAllPackages?softwareId=53303667563959301

# 下载接口（应返回文件内容 / 200）
https://your-domain.com/api/unauth/52047071297934341/53489520232895493/43.jpg
```

浏览器打开游戏 → 检查：
- 主菜单 → 谱面库 → 社区：能列出谱面
- 主菜单 → 公告：能显示公告
- 设置 → 素材修复：能下载素材

## 5. 其他服务器

### 宝塔面板
- 网站 → 添加站点 → 静态（或反向代理）→ 根目录设为 `/var/www/palab`
- 「配置文件」里粘贴第 3 节的 `location /api/upgrade/` 和 `location /api/unauth/` 两段

### Caddy
```caddyfile
your-domain.com {
    root * /var/www/palab
    file_server
    try_files {path} /index.html

    handle_path /api/upgrade/* {
        reverse_proxy https://yarp.lingyanspace.com {
            header_up Host yarp.lingyanspace.com
        }
    }
    handle_path /api/unauth/* {
        reverse_proxy https://yarp.lingyanspace.com {
            header_up Host yarp.lingyanspace.com
        }
    }
}
```

> `handle_path` 会去掉匹配到的前缀再转发；如需保留完整路径，可改用 `handle` + 重写。Nginx 方案最省心，推荐优先用 Nginx。

## 6. 常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| 社区/公告/更新/素材修复 `failed to fetch` | 没配反向代理，浏览器直连 lingyanspace 被 CORS 拦截 | 配置第 3 节的两段 `location` 反代并 reload |
| `/api/upgrade` 返回 404 | Nginx `location` 未匹配或 `try_files` 把请求吞了 | 确认 `location /api/upgrade/` 优先级高于 `location /`；`try_files` 只用于静态文件 |
| `/api/unauth` 返回 502 | lingyanspace 域名解析 / 证书问题 | 确认服务器能访问 `https://yarp.lingyanspace.com`（`curl -I` 测试） |
| 静态资源 404 | 资源路径不对 | `vite.config.ts` 已设 `base: './'`，确认 dist 文件完整上传 |
| HTTPS 下请求被浏览器拦 | 混合内容（HTTP 页面请求 HTTPS 接口） | 给站点配 HTTPS，或在 Nginx 里把所有 HTTP 重定向到 HTTPS |

---

## 附：lingyanspace 软件 ID 速查

| 用途 | softwareId |
|------|-----------|
| 谱面库社区 | `53303667563959301` |
| 公告 / 关于 | `53303754361934853` |
| 素材修复（父） | `52047071297934341` |
| 更新 · Android | `52045257433420805` |
| 更新 · Windows | `52045545676477445` |

详细 API 说明见 [lingyanspace.md](./lingyanspace.md)。
