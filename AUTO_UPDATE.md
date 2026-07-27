# Palab 自动更新 + GitHub 发布指南

## 自动更新原理

Palab 内置了基于 GitHub 的版本检测机制：

1. `public/version.json` 存储服务器端最新版本号及 APK/EXE 下载链接
2. 应用启动时请求此文件，与本地 `package.json` 的版本号比对
3. 若远程版本更新，屏幕底部弹出蓝色更新横幅，点击 **APK** 或 **EXE** 直接下载

## GitHub 发布流程（每次发版只需 3 步）

### 第 1 步：更新版本号 + 构建双端

```bash
# 修改 package.json 中的 version 字段
# 构建 Web + APK
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# APK → android/app/build/outputs/apk/debug/app-debug.apk
```

### 第 2 步：更新 version.json

编辑 `public/version.json`，同步版本号、更新日志和下载链接：

```json
{
  "version": "0.3.0",
  "apkUrl": "https://github.com/Colasensei/PaLab/releases/download/v1.1.0/app-debug.apk",
  "exeUrl": "https://github.com/Colasensei/PaLab/releases/download/v1.1.0/Palab-Setup.exe",
  "changelog": "新增自动更新、性能优化"
}
```

### 第 3 步：创建 GitHub Release

```bash
git add .
git commit -m "v1.1.0: 更新日志"
git tag v1.1.0
git push origin main --tags
```

在 GitHub 仓库页面：
1. **Releases** → **Create a new release**
2. **Tag**: `v1.1.0`
3. 上传 `app-debug.apk` 和 `Palab-Setup.exe` 作为附件
4. 发布

## 自动下载说明

更新横幅中的 APK/EXE 按钮使用 GitHub Release 的固定下载链接格式：
```
https://github.com/Colasensei/PaLab/releases/download/v1.1.0/app-debug.apk
```

用户点击即触发浏览器下载，无需手动访问 Release 页面。

