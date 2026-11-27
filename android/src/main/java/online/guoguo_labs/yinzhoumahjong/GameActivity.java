package online.guoguo_labs.yinzhoumahjong;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import java.io.*;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class GameActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ENTRY = "https://" + HOST + "/index.html";
    private static final long EXIT_WINDOW_MS = 2000;
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    private WebView game;
    private ReplayExport replayExport;
    private long exitDeadline;
    private Toast exitHint;
    private boolean exitRequested;
    private OnBackInvokedCallback backCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        File legacyUpdates = new File(getDataDir(), "app_web_updates");
        if (legacyUpdates.exists()) WORKER.execute(() -> clearLegacyUpdates(legacyUpdates.toPath()));
        game = new WebView(this);
        replayExport = new ReplayExport(this, state);
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // AI turns, dice and delayed tile announcements run outside the player's tap.
        settings.setMediaPlaybackRequiresUserGesture(false);
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
                if ("/android/replay-export".equals(path) && !request.isForMainFrame()) {
                    String id = uri.getQueryParameter("id");
                    if (id == null || !id.matches("replay-export-[0-9]+")) return missing();
                    view.post(() -> replayExport.connect(view, Uri.parse("https://" + HOST), id));
                    return new WebResourceResponse("text/plain", "UTF-8", 204, "No Content",
                            Collections.singletonMap("Cache-Control", "no-store"), null);
                }
                if (path == null || !path.startsWith("/") || path.contains("..") || path.contains("\\"))
                    return missing();
                String name = path.equals("/") ? "index.html" : path.substring(1);
                try {
                    InputStream data = getAssets().open(name);
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

    private static void clearLegacyUpdates(Path directory) {
        try {
            // This private directory contained downloaded ZIPs and unpacked game assets only.
            Files.walkFileTree(directory, new SimpleFileVisitor<Path>() {
                @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.deleteIfExists(file);
                    return FileVisitResult.CONTINUE;
                }

                @Override public FileVisitResult postVisitDirectory(Path folder, IOException error) throws IOException {
                    if (error != null) throw error;
                    Files.deleteIfExists(folder);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ignored) { /* Retry cleanup at the next app launch. */ }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        replayExport.saveState(state);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent result) {
        super.onActivityResult(requestCode, resultCode, result);
        if (requestCode == ReplayExport.CREATE_DOCUMENT) replayExport.onResult(resultCode, result);
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

    // Hardware Back and the system back gesture use the same confirmation window.
    @Override public void onBackPressed() { handleBack(); }

    private void handleBack() {
        if (isFinishing() || exitRequested) return;
        long now = SystemClock.elapsedRealtime();
        if (now < exitDeadline) {
            exitRequested = true;
            finishAndRemoveTask();
            return;
        }
        exitDeadline = now + EXIT_WINDOW_MS;
        if (exitHint != null) exitHint.cancel();
        exitHint = Toast.makeText(this, "再按一次退出游戏", Toast.LENGTH_SHORT);
        exitHint.show();
    }

    @Override protected void onPause() {
        exitDeadline = 0;
        if (exitHint != null) {
            exitHint.cancel();
            exitHint = null;
        }
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        if (game.getParent() instanceof ViewGroup) ((ViewGroup) game.getParent()).removeView(game);
        game.destroy();
        super.onDestroy();
        // Only the explicit double-Back exit terminates the process, after task removal.
        if (exitRequested) android.os.Process.killProcess(android.os.Process.myPid());
    }
}
