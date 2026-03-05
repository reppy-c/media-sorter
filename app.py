import json
import os
import sys
import shutil
import webbrowser
import threading
import time
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory

# Support running as PyInstaller bundle (single executable)
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)
    CONFIG_DIR = Path.home() / "Library" / "Application Support" / "Media Sorter"
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH = CONFIG_DIR / "config.json"
else:
    BASE_DIR = Path(__file__).parent
    CONFIG_PATH = BASE_DIR / "config.json"

app = Flask(__name__, template_folder=str(BASE_DIR / "templates"), static_folder=str(BASE_DIR / "static"))
SUPPORTED_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"},
    "video": {".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"},
}
ALL_EXTENSIONS = SUPPORTED_EXTENSIONS["image"] | SUPPORTED_EXTENSIONS["video"]

source_folder = None
sorted_folder = None
groups = []
undo_stack = []


def load_config():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return None


def save_config(source, group_names):
    with open(CONFIG_PATH, "w") as f:
        json.dump({"source_folder": source, "groups": group_names}, f, indent=2)


def get_media_files(folder):
    files = []
    for entry in sorted(Path(folder).iterdir()):
        if entry.is_file() and entry.suffix.lower() in ALL_EXTENSIONS:
            files.append(entry.name)
    return files


def file_type(filename):
    ext = Path(filename).suffix.lower()
    if ext in SUPPORTED_EXTENSIONS["video"]:
        return "video"
    return "image"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/config")
def get_config():
    config = load_config()
    if config:
        return jsonify(config)
    return jsonify(None)


@app.route("/api/browse")
def browse_folders():
    raw = request.args.get("path", "~")
    folder = os.path.expanduser(raw)
    if not os.path.isdir(folder):
        folder = os.path.expanduser("~")
    folder = os.path.realpath(folder)
    parent = os.path.dirname(folder)

    dirs = []
    try:
        for entry in sorted(os.scandir(folder), key=lambda e: e.name.lower()):
            if entry.is_dir() and not entry.name.startswith("."):
                has_media = False
                try:
                    has_media = any(
                        Path(f.path).suffix.lower() in ALL_EXTENSIONS
                        for f in os.scandir(entry.path) if f.is_file()
                    )
                except PermissionError:
                    pass
                dirs.append({"name": entry.name, "has_media": has_media})
    except PermissionError:
        pass

    media_count = 0
    try:
        media_count = sum(
            1 for f in os.scandir(folder)
            if f.is_file() and Path(f.path).suffix.lower() in ALL_EXTENSIONS
        )
    except PermissionError:
        pass

    return jsonify({
        "path": folder,
        "parent": parent if parent != folder else None,
        "dirs": dirs,
        "media_count": media_count,
    })


@app.route("/api/start", methods=["POST"])
def start_session():
    global source_folder, sorted_folder, groups, undo_stack
    data = request.json
    source_folder = os.path.expanduser(data["source_folder"])
    groups = data["groups"]
    undo_stack = []

    if not os.path.isdir(source_folder):
        return jsonify({"error": f"Folder not found: {source_folder}"}), 400

    # Sorted folders live inside source, named "1 - Name", "2 - Name", ...
    sorted_folder = source_folder
    try:
        for i, group_name in enumerate(groups):
            folder_name = f"{i + 1} - {group_name}"
            os.makedirs(os.path.join(sorted_folder, folder_name), exist_ok=True)
    except PermissionError:
        return jsonify({
            "error": "Permission denied: cannot create folders in that location. Try a different folder or grant the app Full Disk Access in System Settings → Privacy & Security."
        }), 403

    save_config(data["source_folder"], groups)

    files = get_media_files(source_folder)
    file_info = [{"name": f, "type": file_type(f)} for f in files]
    return jsonify({"files": file_info, "total": len(file_info)})


def _group_folder_name(group):
    """Folder name for a group: '1 - Name', '2 - Name', ..."""
    i = groups.index(group)
    return f"{i + 1} - {group}"


@app.route("/api/sort", methods=["POST"])
def sort_file():
    data = request.json
    filename = data["filename"]
    group = data["group"]

    src = os.path.join(source_folder, filename)
    dst_dir = os.path.join(sorted_folder, _group_folder_name(group))
    dst = os.path.join(dst_dir, filename)

    if not os.path.exists(src):
        return jsonify({"error": "File not found"}), 404

    os.makedirs(dst_dir, exist_ok=True)
    shutil.move(src, dst)
    undo_stack.append({"filename": filename, "group": group})
    return jsonify({"ok": True})


@app.route("/api/undo", methods=["POST"])
def undo():
    if not undo_stack:
        return jsonify({"error": "Nothing to undo"}), 400

    action = undo_stack.pop()
    filename = action["filename"]
    group = action["group"]

    src = os.path.join(sorted_folder, _group_folder_name(group), filename)
    dst = os.path.join(source_folder, filename)

    if not os.path.exists(src):
        return jsonify({"error": "Sorted file not found"}), 404

    shutil.move(src, dst)
    return jsonify({"filename": filename, "type": file_type(filename)})


@app.route("/media/<path:filename>")
def serve_media(filename):
    return send_from_directory(source_folder, filename)


@app.route("/api/quit", methods=["POST"])
def quit_app():
    """Exit the app so the server process stops (e.g. when running as .app)."""
    os._exit(0)


def _open_browser():
    time.sleep(1.2)
    webbrowser.open("http://127.0.0.1:5000")


if __name__ == "__main__":
    threading.Thread(target=_open_browser, daemon=True).start()
    app.run(debug=False, port=5000, host="127.0.0.1")
