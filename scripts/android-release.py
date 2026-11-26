"""Build one offline APK and matching static website/update package."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "android"
KEY_DIR = ROOT / ".android-signing"
HISTORY = ROOT / "artifacts" / "android"
EPOCH = 1577836800  # 2020-01-01 UTC


def init_signing():
    KEY_DIR.mkdir(mode=0o700, exist_ok=False)
    key = KEY_DIR / "release.p12"
    password = secrets.token_urlsafe(32)
    with tempfile.TemporaryDirectory(dir=KEY_DIR) as tmp:
        generated = Path(tmp) / "release.p12"
        subprocess.run([
            "keytool", "-genkeypair", "-storetype", "PKCS12", "-keystore", str(generated),
            "-storepass:env", "YINZHOU_KEY_PASSWORD", "-alias", "yinzhou", "-keyalg", "RSA",
            "-keysize", "3072", "-validity", "10000", "-dname", "CN=Yinzhou Mahjong",
        ], env={**os.environ, "YINZHOU_KEY_PASSWORD": password}, check=True)
        (KEY_DIR / "password").write_text(password, encoding="utf-8")
        generated.replace(key)
    print("Signing identity created. Back up the entire .android-signing directory privately.")


def publish_file(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as output:
        staged = Path(output.name)
        try:
            with source.open("rb") as data:
                shutil.copyfileobj(data, output)
        except BaseException:
            output.close()
            staged.unlink(missing_ok=True)
            raise
    shutil.copymode(source, staged)
    staged.replace(target)


def release():
    env = dict(os.environ)
    if "YINZHOU_KEYSTORE" not in env and (KEY_DIR / "release.p12").is_file():
        env["YINZHOU_KEYSTORE"] = str(KEY_DIR / "release.p12")
        env["YINZHOU_KEY_PASSWORD"] = (KEY_DIR / "password").read_text(encoding="utf-8").strip()
    if not env.get("YINZHOU_KEY_PASSWORD") or not Path(env.get("YINZHOU_KEYSTORE", "")).is_file():
        sys.exit("Restore .android-signing or set YINZHOU_KEYSTORE/YINZHOU_KEY_PASSWORD. "
                 "For a new app only, create its signing identity with pnpm android:signing-init.")
    env["YINZHOU_KEYSTORE"] = str(Path(env["YINZHOU_KEYSTORE"]).resolve())
    now = datetime.now(timezone.utc)
    code = int(env.get("YINZHOU_VERSION_CODE", int(now.timestamp()) - EPOCH))
    name = now.strftime("%Y.%m.%d.%H%M%S")
    previous = [int(p.name) for p in HISTORY.iterdir() if p.is_dir() and p.name.isdecimal()]
    if not max(previous, default=0) < code <= 2100000000:
        sys.exit("Release code must increase. Check YINZHOU_VERSION_CODE and the system clock.")

    with tempfile.TemporaryDirectory(prefix="release-", dir=HISTORY) as tmp:
        stage = Path(tmp)
        web = stage / "site"
        subprocess.run([shutil.which("pnpm") or "pnpm", "run", "build:web", "--outDir", str(web)],
                       cwd=ROOT, check=True)
        files = sorted(p for p in web.rglob("*") if p.is_file())
        if len(files) > 10000 or sum(f.stat().st_size for f in files) > (256 << 20):
            sys.exit("Web content exceeds the Android updater limits")
        update = stage / f"web-{code}.zip"
        with ZipFile(update, "w", compression=ZIP_DEFLATED) as archive:
            for file in files:
                archive.write(file, file.relative_to(web).as_posix())
        if update.stat().st_size > (128 << 20):
            sys.exit("Update package exceeds the Android download limit")
        gradle = [str(ANDROID / "gradlew.bat")] if os.name == "nt" else ["sh", "./gradlew"]
        subprocess.run([*gradle, "assembleRelease", f"-PreleaseCode={code}", f"-PreleaseName={name}",
                        f"-PwebAssetsDir={web}"], cwd=ANDROID, env=env, check=True)
        apk, = (ANDROID / "build/outputs/apk/release").glob("*.apk")
        if "unsigned" in apk.name:
            sys.exit("Gradle produced an unsigned APK")

        manifest = stage / "latest.json"
        manifest.write_text(json.dumps({
            "format": 1, "versionCode": code, "versionName": name, "bytes": update.stat().st_size,
            "sha256": hashlib.sha256(update.read_bytes()).hexdigest(),
        }, indent=2) + "\n", encoding="utf-8")
        # Archive the APK under an immutable version, then publish the manifest last.
        version_dir = HISTORY / str(code)
        version_dir.mkdir()
        saved_apk = version_dir / f"yinzhou-mahjong-{code}.apk"
        publish_file(apk, saved_apk)
        site = ROOT / "dist"
        for file in files:
            if file != web / "index.html":
                publish_file(file, site / file.relative_to(web))
        publish_file(saved_apk, site / "downloads/yinzhou-mahjong.apk")
        publish_file(update, site / "updates" / update.name)
        publish_file(web / "index.html", site / "index.html")
        publish_file(manifest, site / "updates/latest.json")
        print(f"APK: {saved_apk}\nUpload {site} to https://yinzhoumahjong.guoguo-labs.online/")


if __name__ == "__main__":
    if sys.argv[1:] == ["--init-signing"]:
        init_signing()
    elif not sys.argv[1:]:
        HISTORY.mkdir(parents=True, exist_ok=True)
        # Concurrent builds share Gradle outputs and the public APK/manifest pointers.
        with (HISTORY / ".build.lock").open("a+b") as lock:
            try:
                if os.name == "nt":
                    import msvcrt
                    lock.seek(0)
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                sys.exit("Another Android release build is running")
            release()
    else:
        sys.exit("Usage: android-release.py [--init-signing]")
