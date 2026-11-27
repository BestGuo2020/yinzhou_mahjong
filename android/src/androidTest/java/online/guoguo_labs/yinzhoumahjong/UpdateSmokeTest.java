package online.guoguo_labs.yinzhoumahjong;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Runs on the separate .qa application and verifies the retired ZIP migration. */
public final class UpdateSmokeTest extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            verifyApkResources();
            result.putString("result", "PASS: bundled game, legacy update cleanup, and retained WebView storage");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("error", android.util.Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private void verifyApkResources() throws Exception {
        Context app = getTargetContext();
        if (!app.getPackageName().endsWith(".qa")) throw new AssertionError("Requires QA application");
        Activity first = launchGame();
        awaitBundledPage(first);
        evaluate(first, "localStorage.setItem('qa:apk-update', 'preserved')");
        runOnMainSync(first::finish);
        waitForIdleSync();

        File legacy = app.getDir("web_updates", Context.MODE_PRIVATE);
        File version = new File(legacy, "2147483646");
        Files.createDirectories(version.toPath());
        Files.write(new File(version, "index.html").toPath(), "<title>Retired ZIP</title>".getBytes(StandardCharsets.UTF_8));
        Activity updated = launchGame();
        awaitBundledPage(updated);
        if (!"\"preserved\"".equals(evaluate(updated, "localStorage.getItem('qa:apk-update')")))
            throw new AssertionError("WebView storage did not survive");
        long end = SystemClock.elapsedRealtime() + 5000;
        while (legacy.exists() && SystemClock.elapsedRealtime() < end) SystemClock.sleep(50);
        if (legacy.exists()) throw new AssertionError("Retired ZIP resources were left behind");
        evaluate(updated, "localStorage.removeItem('qa:apk-update')");
        runOnMainSync(updated::finish);
    }

    private void awaitBundledPage(Activity activity) throws InterruptedException {
        long end = SystemClock.elapsedRealtime() + 15000;
        while (SystemClock.elapsedRealtime() < end) {
            String page = evaluate(activity, "location.origin + ' ' + document.title");
            if (page.contains("https://appassets.androidplatform.net") && page.contains("颍州扎杠麻将")) return;
            SystemClock.sleep(100);
        }
        throw new AssertionError("Bundled game failed to open");
    }

    private Activity launchGame() {
        return startActivitySync(new Intent(getTargetContext(), GameActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    private String evaluate(Activity activity, String expression) throws InterruptedException {
        CountDownLatch read = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        runOnMainSync(() -> {
            ViewGroup content = activity.findViewById(android.R.id.content);
            ((WebView) content.getChildAt(0)).evaluateJavascript(expression, value -> {
                result.set(value);
                read.countDown();
            });
        });
        if (!read.await(5, TimeUnit.SECONDS)) throw new AssertionError("WebView did not respond");
        return result.get();
    }
}
