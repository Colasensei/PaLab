package com.palab.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * 下载 APK 后直接拉起系统安装器。
 * JS 端传入 base64 数据，写入缓存文件后通过 FileProvider 交给 ACTION_VIEW 安装。
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String base64 = call.getString("base64");
        String fileName = call.getString("fileName", "palab-update.apk");
        if (base64 == null || base64.isEmpty()) {
            call.reject("no base64 data");
            return;
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            File cacheDir = getContext().getCacheDir();
            File apkFile = new File(cacheDir, fileName);
            if (apkFile.exists()) apkFile.delete();
            FileOutputStream fos = new FileOutputStream(apkFile);
            fos.write(bytes);
            fos.flush();
            fos.close();

            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            JSObject ret = new JSObject();
            try {
                getActivity().startActivity(intent);
                ret.put("success", true);
                call.resolve(ret);
            } catch (android.content.ActivityNotFoundException e) {
                ret.put("success", false);
                ret.put("error", "no_installer");
                call.resolve(ret);
            }
        } catch (Exception e) {
            Log.e("ApkInstaller", "install failed", e);
            call.reject(e.getMessage());
        }
    }
}
