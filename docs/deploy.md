# Palab 服务器部署

> lingyanspace 无 CORS 头，联网功能靠服务器反向代理转发 `/api/*`。

## 需要做 3 步

### 1. 上传静态文件
把构建好的 `dist/` 里所有文件传到服务器，如 `/var/www/palab/`。

### 2. Nginx 加两段反向代理
在站点配置的 `server { }` 内加入：

```nginx
location /api/upgrade/ {
    proxy_pass https://yarp.lingyanspace.com/api/UpgradeServer/Upgrade/;
    proxy_set_header Host yarp.lingyanspace.com;
    proxy_ssl_server_name on;
}
location /api/unauth/ {
    proxy_pass https://yarp.lingyanspace.com/UpgradeServer/UnauthorFolder/UpgradeProxy/;
    proxy_set_header Host yarp.lingyanspace.com;
    proxy_ssl_server_name on;
}
```

### 3. 生效并验证
```bash
nginx -t && nginx -s reload
```

浏览器打开游戏检查：社区能列出谱面、公告能显示、素材修复能下载 = 成功。