package online.guoguo_labs.yinzhoumahjong;

import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class WebUpdates {
    private static final String BASE = "https://yinzhoumahjong.guoguo-labs.online/updates/";
    private static final long MAX_ZIP = 128L << 20;
    private static final long MAX_CONTENT = 256L << 20;
    private final File root;

    WebUpdates(File root) { this.root = root; }

    static final class Release {
        final int code;
        final String name;
        final String sha256;
        final long bytes;

        Release(JSONObject json) throws Exception {
            code = json.getInt("versionCode");
            name = json.getString("versionName");
            sha256 = json.getString("sha256");
            bytes = json.getLong("bytes");
            if (json.getInt("format") != 1 || code <= 0 || name.length() > 64
                    || !sha256.matches("[0-9a-f]{64}") || bytes <= 0 || bytes > MAX_ZIP)
                throw new IOException("Invalid release manifest");
        }
    }

    File directory(int code) { return new File(root, Integer.toString(code)); }

    int installedVersion(int bundled) {
        int best = bundled;
        File[] dirs = root.listFiles();
        if (dirs == null) return best;
        for (File dir : dirs) {
            try {
                int code = Integer.parseInt(dir.getName());
                if (code > best && new File(dir, "index.html").isFile()) best = code;
            } catch (NumberFormatException ignored) { /* staging directories */ }
        }
        return best;
    }

    // Called on the serial update worker after the current page's version is selected.
    void clean(int active) throws IOException {
        File[] files = root.listFiles();
        if (files == null) return;
        for (File file : files) {
            if (file.getName().startsWith("incoming-")) {
                deleteTree(file);
            } else if (file.getName().matches("[0-9]{1,10}")
                    && Long.parseLong(file.getName()) < active) {
                deleteTree(file);
            }
        }
    }

    private static HttpURLConnection connect(String resource) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + resource).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(20000);
        connection.setUseCaches(false);
        connection.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (connection.getResponseCode() != 200) throw new IOException("Release unavailable");
            return connection;
        } catch (IOException error) {
            connection.disconnect();
            throw error;
        }
    }

    Release latest() throws Exception {
        HttpURLConnection connection = connect("latest.json");
        try (InputStream in = connection.getInputStream();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            copy(in, out, 8192);
            return new Release(new JSONObject(out.toString("UTF-8")));
        } finally { connection.disconnect(); }
    }

    void download(Release release) throws Exception {
        HttpURLConnection connection = connect("web-" + release.code + ".zip");
        try (InputStream in = connection.getInputStream()) {
            install(release, in);
        } finally { connection.disconnect(); }
    }

    void install(Release release, InputStream input) throws Exception {
        File temp = Files.createTempDirectory(root.toPath(), "incoming-").toFile();
        try {
            File zip = new File(temp, "download.zip");
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            try (OutputStream out = new java.security.DigestOutputStream(new FileOutputStream(zip), hash)) {
                if (copy(input, out, release.bytes) != release.bytes) throw new IOException("Incomplete download");
            }
            StringBuilder digest = new StringBuilder();
            for (byte b : hash.digest()) digest.append(String.format(Locale.ROOT, "%02x", b));
            if (!release.sha256.contentEquals(digest)) throw new IOException("Checksum mismatch");

            File web = new File(temp, "web");
            Files.createDirectory(web.toPath());
            long remaining = MAX_CONTENT;
            int entries = 0;
            try (ZipInputStream archive = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)),
                    StandardCharsets.UTF_8)) {
                for (ZipEntry entry; (entry = archive.getNextEntry()) != null;) {
                    if (++entries > 10000) throw new IOException("Too many files");
                    File target = new File(web, entry.getName());
                    if (!target.getCanonicalPath().startsWith(web.getCanonicalPath() + File.separator))
                        throw new IOException("Invalid resource path");
                    if (entry.isDirectory()) {
                        Files.createDirectories(target.toPath());
                    } else {
                        Files.createDirectories(target.getParentFile().toPath());
                        try (OutputStream out = Files.newOutputStream(target.toPath(), java.nio.file.StandardOpenOption.CREATE_NEW)) {
                            remaining -= copy(archive, out, remaining);
                        }
                    }
                }
            }
            if (!new File(web, "index.html").isFile()) throw new IOException("Missing game entry");
            Files.move(web.toPath(), directory(release.code).toPath(), StandardCopyOption.ATOMIC_MOVE);
        } finally { deleteTree(temp); }
    }

    private static long copy(InputStream in, OutputStream out, long limit) throws IOException {
        byte[] buffer = new byte[32768];
        long total = 0;
        for (int count; (count = in.read(buffer)) != -1;) {
            total += count;
            if (total > limit) throw new IOException("Size limit exceeded");
            out.write(buffer, 0, count);
        }
        return total;
    }

    private static void deleteTree(File file) throws IOException {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        Files.deleteIfExists(file.toPath());
    }
}
