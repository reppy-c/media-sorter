#!/usr/bin/env python3
"""
Build Media Sorter as a double-clickable macOS .app bundle.

Requires: pip install pyinstaller

Run from project root: python3 build_app.py

Output: dist/Media Sorter.app
"""

import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
DIST_DIR = PROJECT_DIR / "dist"
APP_NAME = "Media Sorter"
APP_BUNDLE = DIST_DIR / f"{APP_NAME}.app"
MACOS_DIR = APP_BUNDLE / "Contents" / "MacOS"
RESOURCES_DIR = APP_BUNDLE / "Contents" / "Resources"


def main():
    # Build with PyInstaller (one-file, no console so no terminal window)
    spec_path = PROJECT_DIR / "media_sorter.spec"
    subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", str(spec_path)],
        cwd=PROJECT_DIR,
        check=True,
    )

    # PyInstaller one-file puts executable in dist/Media Sorter (no .app)
    exe_src = DIST_DIR / APP_NAME
    if not exe_src.exists():
        print("PyInstaller did not produce expected executable")
        sys.exit(1)

    # Create .app bundle structure
    if APP_BUNDLE.exists():
        shutil.rmtree(APP_BUNDLE)
    MACOS_DIR.mkdir(parents=True)
    RESOURCES_DIR.mkdir(parents=True)

    # Move the executable into the bundle
    exe_dst = MACOS_DIR / APP_NAME
    shutil.move(str(exe_src), str(exe_dst))
    os.chmod(exe_dst, 0o755)

    # Info.plist so macOS treats it as an app
    info_plist = {
        "CFBundleDisplayName": APP_NAME,
        "CFBundleExecutable": APP_NAME,
        "CFBundleIdentifier": "com.mediasorter.app",
        "CFBundleName": APP_NAME,
        "CFBundlePackageType": "APPL",
        "CFBundleShortVersionString": "1.0.0",
        "NSHighResolutionCapable": True,
    }
    with open(APP_BUNDLE / "Contents" / "Info.plist", "wb") as f:
        plistlib.dump(info_plist, f)

    print(f"Done. App bundle: {APP_BUNDLE}")
    print("Double-click 'Media Sorter.app' to run. Your browser will open to the app.")


if __name__ == "__main__":
    main()
