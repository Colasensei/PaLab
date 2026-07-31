package com.palab.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Android 媒体控制（MediaSession + MediaStyle 通知）
 * - 同步元数据（标题/作者/时长/进度/封面）到系统
 * - 发布 MediaStyle 通知 → 通知栏 / 锁屏 / 播控中心显示控制
 * - 系统控制（通知栏按钮 / 锁屏 / 耳机）→ notifyListeners("control", {action})
 * - Android 13+ 需要 POST_NOTIFICATIONS 权限才能显示通知
 */
@CapacitorPlugin(
    name = "MediaSession",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class MediaSessionPlugin extends Plugin {
    private static final String TAG = "PalabMedia";
    private static final String CHANNEL_ID = "palab_music";
    private static final int NOTIFICATION_ID = 5204;

    private static MediaSession sSession;
    private static boolean sPlaying = false;

    private MediaSession session;
    private String lastTitle = "";
    private String lastArtist = "";
    private boolean lastPlaying = false;

    @Override
    public void load() {
        super.load();
        try {
            Context ctx = getContext();
            session = new MediaSession(ctx, "PalabMusic");
            sSession = session;
            session.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() { sPlaying = true; emit("play"); }
                @Override public void onPause() { sPlaying = false; emit("pause"); }
                @Override public void onStop() { sPlaying = false; emit("pause"); }
                @Override public void onSkipToNext() { emit("next"); }
                @Override public void onSkipToPrevious() { emit("prev"); }
                @Override public void onSeekTo(long pos) {
                    JSObject d = new JSObject();
                    d.put("action", "seek");
                    d.put("position", pos);
                    notifyListeners("control", d);
                }
            });
            session.setActive(false);
        } catch (Throwable t) {
            Log.e(TAG, "init failed", t);
        }
    }

    public static MediaSession getSession() { return sSession; }
    public static boolean isPlaying() { return sPlaying; }

    private void emit(String action) {
        JSObject d = new JSObject();
        d.put("action", action);
        notifyListeners("control", d);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) { call.resolve(); return; }
        requestPermissionForAlias("notifications", call, "notificationsPermissionResult");
    }

    @PermissionCallback
    public void notificationsPermissionResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
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

            sPlaying = playing;

            MediaMetadata.Builder mb = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, Math.max(0, duration));
            Bitmap art = null;
            if (cover != null && !cover.isEmpty()) {
                art = decodeBase64Image(cover);
                if (art != null) mb.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
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

            // 仅当元数据/播放状态变化时重发通知（进度同步每 1s 一次，避免刷屏）
            if (!title.equals(lastTitle) || !artist.equals(lastArtist) || playing != lastPlaying) {
                postNotification(title, artist, art, playing);
                lastTitle = title; lastArtist = artist; lastPlaying = playing;
            }
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
            sPlaying = false;
            cancelNotification();
            call.resolve();
        } catch (Throwable t) {
            call.reject(t.getMessage());
        }
    }

    // ═══ 媒体通知 ═══

    private void createChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "音乐播放", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    private void postNotification(String title, String artist, Bitmap art, boolean playing) {
        try {
            Context ctx = getContext();
            if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return; // 没通知权限就不发
            }
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            createChannel(nm);

            Intent contentIntent = new Intent(ctx, MainActivity.class);
            contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent contentPi = PendingIntent.getActivity(ctx, 0, contentIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Notification.Builder nb = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(ctx, CHANNEL_ID)
                : new Notification.Builder(ctx);
            nb.setSmallIcon(R.drawable.ic_music_note)
                .setContentTitle(title)
                .setContentText(artist)
                .setContentIntent(contentPi)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(playing)
                .setOnlyAlertOnce(true);
            if (art != null) nb.setLargeIcon(art);

            Notification.MediaStyle style = new Notification.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2);
            nb.setStyle(style)
                .addAction(actionPi("prev", 1, R.drawable.ic_prev, "上一首"))
                .addAction(playing
                    ? actionPi("pause", 2, R.drawable.ic_pause, "暂停")
                    : actionPi("play", 2, R.drawable.ic_play, "播放"))
                .addAction(actionPi("next", 3, R.drawable.ic_next, "下一首"));

            nm.notify(NOTIFICATION_ID, nb.build());
        } catch (Throwable t) {
            Log.e(TAG, "postNotification failed", t);
        }
    }

    private Notification.Action actionPi(String action, int code, int iconRes, String label) {
        Intent i = new Intent(getContext(), MediaActionReceiver.class);
        i.setAction("com.palab.app.MEDIA_ACTION");
        i.putExtra("action", action);
        PendingIntent pi = PendingIntent.getBroadcast(getContext(), code, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(
            Icon.createWithResource(getContext(), iconRes), label, pi
        ).build();
    }

    private void cancelNotification() {
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        } catch (Throwable t) { /* ignore */ }
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
