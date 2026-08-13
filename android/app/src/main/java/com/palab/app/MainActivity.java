package com.palab.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate() 之前注册：super 内部会 load() 创建 bridge 并把插件注入 WebView，
        // 之后调用 registerPlugin 只会加进 builder，不会进已创建的 bridge，导致 "plugin is not implemented"
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(MediaSessionPlugin.class);
        super.onCreate(savedInstanceState);
        // WebView 底层渲染优化：硬件加速层 + 关闭干扰性 WebView 行为 + 高刷新率
        try {
            android.webkit.WebView wv = getBridge().getWebView();
            if (wv != null) {
                WebSettings ws = wv.getSettings();
                ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                // 硬件加速渲染层
                wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
                // 关闭系统暗色强制渲染（避免 WebView 暗色处理干扰颜色/性能）
                if (Build.VERSION.SDK_INT >= 29) {
                    ws.setForceDark(WebSettings.FORCE_DARK_OFF);
                }
                // 禁用 WebView 缩放相关干扰
                ws.setSupportZoom(false);
                ws.setBuiltInZoomControls(false);
                ws.setDisplayZoomControls(false);
                // 音频播放不受手势限制（音游音效/音乐）
                ws.setMediaPlaybackRequiresUserGesture(false);
                // 解锁高刷新率（Android 11+）：请求 120Hz，设备支持则满刷（低延迟音游体验）
                if (Build.VERSION.SDK_INT >= 30) {
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.preferredRefreshRate = 120f;
                    getWindow().setAttributes(lp);
                }
            }
        } catch (Throwable ignored) {}
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
            // 部分 OEM 会延迟重绘状态栏，再压一次
            getWindow().getDecorView().postDelayed(() -> {
                if (!isFinishing() && !isDestroyed()) hideSystemUI();
            }, 300);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemUI();
    }

    private void hideSystemUI() {
        if (getWindow() == null) return;
        Window window = getWindow();
        View decorView = window.getDecorView();
        try {
            // 状态栏 / 导航栏透明（有些 OEM 会按颜色重绘状态栏）
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            // 刘海屏：延伸到刘海区域，避免顶部留白
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }
            // Android 11+ 现代 API
            WindowCompat.setDecorFitsSystemWindows(window, false);
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(window, decorView);
            if (c != null) {
                c.hide(WindowInsetsCompat.Type.statusBars());
                c.hide(WindowInsetsCompat.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } catch (Throwable ignored) {}
        // 兜底（Android 10 及以下）
        try {
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        } catch (Throwable ignored) {}
    }
}
