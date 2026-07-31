package com.palab.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android 媒体控制（MediaSession）桥接
 * - JS 端同步元数据（标题/作者/时长/进度/播放状态/封面）
 * - 系统锁屏 / 通知栏 / 耳机按键 → notifyListeners("control", {action})
 */
@CapacitorPlugin(name = "MediaSession")
public class MediaSessionPlugin extends Plugin {
    private static final String TAG = "PalabMedia";

    private MediaSession session;
    private MediaSession.Callback callback;

    @Override
    public void load() {
        super.load();
        try {
            Context ctx = getContext();
            session = new MediaSession(ctx, "PalabMusic");
            callback = new MediaSession.Callback() {
                @Override public void onPlay() { emit("play"); }
                @Override public void onPause() { emit("pause"); }
                @Override public void onStop() { emit("pause"); }
                @Override public void onSkipToNext() { emit("next"); }
                @Override public void onSkipToPrevious() { emit("prev"); }
                @Override public void onSeekTo(long pos) {
                    JSObject d = new JSObject();
                    d.put("action", "seek");
                    d.put("position", pos);
                    notifyListeners("control", d);
                }
                @Override public boolean onMediaButtonEvent(Intent mediaButtonEvent) {
                    return super.onMediaButtonEvent(mediaButtonEvent);
                }
            };
            session.setCallback(callback);
            session.setActive(false);
        } catch (Throwable t) {
            Log.e(TAG, "init failed", t);
        }
    }

    private void emit(String action) {
        JSObject d = new JSObject();
        d.put("action", action);
        notifyListeners("control", d);
    }

    @PluginMethod
    public void update(PluginCall call) {
        try {
            if (session == null) { call.resolve(); return; }
            String title = call.getString("title", "");
            String artist = call.getString("artist", "");
            int duration = call.getInt("duration", 0);
            long position = call.getLong("position", 0L);
            boolean playing = call.getBoolean("playing", false);
            String cover = call.getString("coverUrl");

            MediaMetadata.Builder mb = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, Math.max(0, duration));
            if (cover != null && !cover.isEmpty()) {
                Bitmap bmp = decodeBase64Image(cover);
                if (bmp != null) {
                    mb.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, bmp);
                }
            }
            session.setMetadata(mb.build());

            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO
                | PlaybackState.ACTION_STOP;
            int state = playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
            PlaybackState ps = new PlaybackState.Builder()
                .setActions(actions)
                .setState(state, Math.max(0, position), playing ? 1.0f : 0.0f)
                .build();
            session.setPlaybackState(ps);
            session.setActive(true);
            call.resolve();
        } catch (Throwable t) {
            Log.e(TAG, "update failed", t);
            call.reject(t.getMessage());
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            if (session != null) {
                session.setActive(false);
                session.setMetadata(new MediaMetadata.Builder().build());
                session.setPlaybackState(
                    new PlaybackState.Builder().setState(PlaybackState.STATE_NONE, 0, 0).build()
                );
            }
            call.resolve();
        } catch (Throwable t) {
            call.reject(t.getMessage());
        }
    }

    private Bitmap decodeBase64Image(String dataUrl) {
        try {
            String b64 = dataUrl;
            int comma = dataUrl.indexOf(',');
            if (comma >= 0) b64 = dataUrl.substring(comma + 1);
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Throwable t) {
            return null;
        }
    }
}
