package online.guoguo_labs.yinzhoumahjong;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class ReplayExport {
    static final int CREATE_DOCUMENT = 41;
    private static final String PENDING = "pendingReplayExport";
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private final Activity activity;
    private WebMessagePort reply;
    private File pending;
    private boolean picking;

    ReplayExport(Activity activity, Bundle state) {
        this.activity = activity;
        // Android can reclaim the game process while its document picker is open.
        String name = state == null ? null : state.getString(PENDING);
        if (name != null) {
            pending = new File(activity.getCacheDir(), name);
            picking = true;
        }
    }

    void connect(WebView view, Uri origin, String requestId) {
        if (activity.isDestroyed() || activity.isFinishing()) return;
        WebMessagePort[] channel = view.createWebMessageChannel();
        channel[0].setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override public void onMessage(WebMessagePort port, WebMessage request) {
                start(request.getData(), port);
            }
        });
        view.postWebMessage(new WebMessage(requestId, new WebMessagePort[]{channel[1]}), origin);
    }

    private void start(String data, WebMessagePort response) {
        int split = data == null ? -1 : data.indexOf('\n');
        String filename = split > 0 ? data.substring(0, split) : "";
        if (reply != null || pending != null || !filename.matches("(replay|analysis)-[a-zA-Z0-9_-]+\\.json")) {
            response.postMessage(new WebMessage("failed"));
            response.close();
            return;
        }
        reply = response;
        IO.execute(() -> {
            File staged = null;
            try {
                staged = File.createTempFile("replay-", ".json", activity.getCacheDir());
                Files.write(staged.toPath(), data.substring(split + 1).getBytes(StandardCharsets.UTF_8));
                File ready = staged;
                activity.runOnUiThread(() -> chooseDestination(ready, filename));
            } catch (IOException error) {
                if (staged != null) staged.delete();
                activity.runOnUiThread(() -> finish("failed"));
            }
        });
    }

    private void chooseDestination(File ready, String filename) {
        if (activity.isDestroyed() || activity.isFinishing()) {
            ready.delete();
            return;
        }
        pending = ready;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE).setType("application/json")
                .putExtra(Intent.EXTRA_TITLE, filename);
        try {
            picking = true;
            activity.startActivityForResult(intent, CREATE_DOCUMENT);
        } catch (android.content.ActivityNotFoundException | SecurityException error) {
            finish("failed");
        }
    }

    void saveState(Bundle state) {
        if (picking && pending != null) state.putString(PENDING, pending.getName());
    }

    void onResult(int resultCode, Intent result) {
        picking = false;
        if (resultCode == Activity.RESULT_CANCELED) {
            finish("cancelled");
            return;
        }
        Uri target = result == null ? null : result.getData();
        File file = pending;
        if (resultCode != Activity.RESULT_OK || file == null || target == null || !"content".equals(target.getScheme())) {
            finish("failed");
            return;
        }
        IO.execute(() -> {
            try (OutputStream out = activity.getContentResolver().openOutputStream(target, "wt")) {
                if (out == null) throw new IOException("Document unavailable");
                Files.copy(file.toPath(), out);
            } catch (IOException | RuntimeException error) {
                activity.runOnUiThread(() -> finish("failed"));
                return;
            }
            activity.runOnUiThread(() -> finish("saved"));
        });
    }

    private void finish(String status) {
        picking = false;
        if (pending != null) pending.delete();
        pending = null;
        if (activity.isDestroyed()) return;
        if (reply != null) {
            reply.postMessage(new WebMessage(status));
            reply.close();
            reply = null;
        } else {
            // A recreated WebView no longer holds the original request's reply port.
            String message = status.equals("saved") ? "已保存到所选文件夹" :
                    status.equals("cancelled") ? "已取消保存" : "文件保存失败，请重新导出";
            Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
        }
    }
}
