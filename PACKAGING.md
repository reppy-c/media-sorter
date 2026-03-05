# Packaging Media Sorter as a single-click app

## Build a double-clickable macOS app

1. **Install PyInstaller** (one-time):
   ```bash
   pip install pyinstaller
   ```

2. **Build the app**:
   ```bash
   cd /path/to/mike
   python3 build_app.py
   ```

3. **Output**: `dist/Media Sorter.app`

4. **Run it**: Double-click **Media Sorter.app**. Your browser will open to the app. No terminal window will appear.

## First run (macOS security)

If macOS blocks the app because it’s from an unidentified developer:

- **Option A**: Right-click **Media Sorter.app** → **Open** → **Open** in the dialog.
- **Option B**: **System Settings** → **Privacy & Security** → under “Security” click **Open Anyway** for Media Sorter.

## Where config is stored

- **When running from source**: `config.json` in the project folder.
- **When running from the .app**: `~/Library/Application Support/Media Sorter/config.json`

## Build only the executable (no .app)

To build just the single executable (e.g. to run from Terminal):

```bash
pyinstaller --clean media_sorter.spec
```

The binary will be at `dist/Media Sorter`. Run it with `./dist/Media\ Sorter`; it will start the server and open your browser.
