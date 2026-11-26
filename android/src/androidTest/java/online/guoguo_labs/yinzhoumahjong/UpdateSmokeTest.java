package online.guoguo_labs.yinzhoumahjong;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Runs in the separate .qa app. Only the native release endpoint gets fixture responses. */
public final class UpdateSmokeTest extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            exerciseUpdate();
            result.putString("result", "PASS: defer, download, next launch, corrupt and interrupted updates");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("error", android.util.Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private void exerciseUpdate() throws Exception {
        Context app = getTargetContext();
        if (!app.getPackageName().endsWith(".qa")) throw new AssertionError("Requires QA application");
        WebUpdates updates = new WebUpdates(app.getDir("web_updates", Context.MODE_PRIVATE));
        int code = updates.installedVersion(BuildConfig.VERSION_CODE) + 1;
        String marker = "offline-version-" + code;
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (ZipOutputStream out = new ZipOutputStream(buffer)) {
            out.putNextEntry(new ZipEntry("index.html"));
            out.write(("<html><body>" + marker + "</body></html>").getBytes(StandardCharsets.UTF_8));
        }
        byte[] zip = buffer.toByteArray();
        StringBuilder sha = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(zip)) sha.append(String.format(Locale.ROOT, "%02x", b));
        JSONObject json = new JSONObject().put("format", 1).put("versionCode", code)
                .put("versionName", "QA").put("bytes", zip.length).put("sha256", sha.toString());
        byte[] manifest = json.toString().getBytes(StandardCharsets.UTF_8);
        AtomicInteger downloads = new AtomicInteger();
        URL.setURLStreamHandlerFactory(protocol -> !protocol.equals("https") ? null : new URLStreamHandler() {
            @Override protected URLConnection openConnection(URL url) throws IOException {
                if (!url.getHost().equals("yinzhoumahjong.guoguo-labs.online")) throw new IOException("Offline");
                byte[] body;
                if (url.getPath().equals("/updates/latest.json")) body = manifest;
                else if (url.getPath().equals("/updates/web-" + code + ".zip")) {
                    downloads.incrementAndGet();
                    body = zip;
                } else throw new IOException("Unexpected path");
                return new HttpURLConnection(url) {
                    public void connect() {}
                    public void disconnect() {}
                    public boolean usingProxy() { return false; }
                    public int getResponseCode() { return 200; }
                    public InputStream getInputStream() { return new ByteArrayInputStream(body); }
                };
            }
        });

        Activity first = launchGame();
        click("稍后");
        if (downloads.get() != 0) throw new AssertionError("Downloaded before confirmation");
        runOnMainSync(first::finish);
        waitForIdleSync();
        Activity second = launchGame();
        click("下载更新");
        click("下次启动");
        if (downloads.get() != 1 || updates.installedVersion(1) != code || body(second).contains(marker))
            throw new AssertionError("Current game must survive the download");
        runOnMainSync(second::finish);
        waitForIdleSync();
        Activity updated = launchGame();
        long until = SystemClock.elapsedRealtime() + 15000;
        while (!body(updated).contains(marker)) {
            if (SystemClock.elapsedRealtime() > until) throw new AssertionError("Downloaded page failed to open");
            SystemClock.sleep(100);
        }
        json.put("versionCode", code + 1);
        WebUpdates.Release next = new WebUpdates.Release(json);
        for (byte[] damaged : new byte[][] { new byte[zip.length], new byte[zip.length / 2] }) {
            try {
                updates.install(next, new ByteArrayInputStream(damaged));
                throw new AssertionError("Damaged update accepted");
            } catch (IOException expected) {
                if (updates.installedVersion(1) != code) throw new AssertionError("Good version lost");
            }
        }
        runOnMainSync(updated::finish);
    }

    private Activity launchGame() {
        return startActivitySync(new Intent(getTargetContext(), GameActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    private void click(String label) {
        long end = SystemClock.elapsedRealtime() + 20000;
        while (SystemClock.elapsedRealtime() < end) {
            AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
            if (root != null) for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText(label)) {
                if (node.isClickable() && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return;
            }
            SystemClock.sleep(150);
        }
        throw new AssertionError("Missing dialog button " + label);
    }

    private String body(Activity activity) throws InterruptedException {
        CountDownLatch read = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        runOnMainSync(() -> {
            ViewGroup content = activity.findViewById(android.R.id.content);
            ((WebView)content.getChildAt(0)).evaluateJavascript("document.body?.innerText", value -> {
                result.set(value); read.countDown();
            });
        });
        if (!read.await(5, TimeUnit.SECONDS)) throw new AssertionError("WebView did not respond");
        return result.get();
    }
}
