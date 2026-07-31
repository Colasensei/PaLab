package com.palab.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.session.MediaController;
import android.media.session.MediaSession;

/**
 * 媒体通知上的控制按钮（上一首/播放/暂停/下一首）
 * 收到系统/通知栏的动作后，转发给 MediaSession 的 TransportControls，
 * 从而触发 MediaSessionPlugin 的 onPlay/onPause/onSkipToNext... 回调 → notifyListeners → JS
 */
public class MediaActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"com.palab.app.MEDIA_ACTION".equals(intent.getAction())) return;
        String action = intent.getStringExtra("action");
        MediaSession s = MediaSessionPlugin.getSession();
        if (s == null) return;
        MediaController.TransportControls tc = s.getController().getTransportControls();
        if (tc == null) return;
        if ("prev".equals(action)) {
            tc.skipToPrevious();
        } else if ("next".equals(action)) {
            tc.skipToNext();
        } else if ("play".equals(action)) {
            tc.play();
        } else if ("pause".equals(action)) {
            tc.pause();
        } else if ("toggle".equals(action)) {
            if (MediaSessionPlugin.isPlaying()) tc.pause();
            else tc.play();
        }
    }
}
