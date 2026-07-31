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
        super.onCreate(savedInstanceState);
        // 允许 WebView 混合内容（HTTPS 页面请求 HTTP 资源），修复 Android 端 fetch 失败
        try {
            android.webkit.WebView wv = getBridge().getWebView();
            if (wv != null) {
                wv.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
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
