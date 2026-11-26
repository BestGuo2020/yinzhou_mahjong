package online.guoguo_labs.yinzhoumahjong;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.webkit.*;
import android.widget.Toast;
import java.io.*;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class GameActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ENTRY = "https://" + HOST + "/index.html";
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    private WebView game;
    private WebUpdates updates;
    private int current;
    private long lastCheck;
    private boolean busy;
    private boolean resumed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        updates = new WebUpdates(getDir("web_updates", MODE_PRIVATE));
        current = updates.installedVersion(BuildConfig.VERSION_CODE);
        File web = current > BuildConfig.VERSION_CODE ? updates.directory(current) : null;
        WORKER.execute(() -> {
            try { updates.clean(current); } catch (IOException ignored) {}
        });
        game = new WebView(this);
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        game.setWebChromeClient(new WebChromeClient());
        game.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !local(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!local(uri)) return null;
                String path = uri.getPath();
                if (path == null || !path.startsWith("/") || path.contains("..") || path.contains("\\"))
                    return missing();
                String name = path.equals("/") ? "index.html" : path.substring(1);
                try {
                    InputStream data = web == null ? getAssets().open(name) : new FileInputStream(new File(web, name));
                    return new WebResourceResponse(mime(name), null, 200, "OK",
                            Collections.singletonMap("Cache-Control", "no-store"), data);
                } catch (IOException error) { return missing(); }
            }
        });
        setContentView(game);
        game.loadUrl(ENTRY);
    }

    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getAuthority());
    }

    private static String mime(String name) {
        String ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (ext) {
            case "js": return "text/javascript";
            case "webmanifest": return "application/manifest+json";
            case "ogg": return "audio/ogg";
            case "woff2": return "font/woff2";
            default:
                String type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                return type == null ? "application/octet-stream" : type;
        }
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        long now = SystemClock.elapsedRealtime();
        if (busy || (lastCheck != 0 && now - lastCheck < 15 * 60000L)) return;
        lastCheck = now;
        busy = true;
        WORKER.execute(() -> {
            try {
                WebUpdates.Release release = updates.latest();
                boolean newer = release.code > updates.installedVersion(BuildConfig.VERSION_CODE);
                runOnUiThread(() -> {
                    busy = false;
                    if (newer && resumed && !isFinishing() && !isDestroyed()) offer(release);
                });
            } catch (Exception offline) { runOnUiThread(() -> busy = false); }
        });
    }

    private void offer(WebUpdates.Release release) {
        String size = String.format(Locale.CHINA, "%.1f MB", release.bytes / 1048576.0);
        new AlertDialog.Builder(this).setTitle("发现新版本 " + release.name)
                .setMessage("下载 " + size + " 的游戏资源即可更新。你可以继续当前对局。")
                .setNegativeButton("稍后", null).setPositiveButton("下载更新", (dialog, which) -> {
                    busy = true;
                    Toast.makeText(this, "正在后台下载更新", Toast.LENGTH_SHORT).show();
                    WORKER.execute(() -> {
                        try {
                            updates.download(release);
                            runOnUiThread(() -> {
                                busy = false;
                                if (!resumed || isFinishing() || isDestroyed()) return;
                                new AlertDialog.Builder(this).setTitle("更新已就绪")
                                        .setMessage("下次启动会使用新版。现在重启将结束当前对局。")
                                        .setNegativeButton("下次启动", null)
                                        .setPositiveButton("现在重启", (d, w) -> recreate()).show();
                            });
                        } catch (Exception error) {
                            runOnUiThread(() -> {
                                busy = false;
                                lastCheck = 0;
                                if (resumed) Toast.makeText(this, "更新失败，当前版本仍可使用", Toast.LENGTH_LONG).show();
                            });
                        }
                    });
                }).show();
    }

    @Override protected void onPause() { resumed = false; super.onPause(); }

    @Override protected void onDestroy() {
        game.destroy();
        super.onDestroy();
    }
}
