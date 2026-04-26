# Mac app build resources

`electron-builder` looks here for branding assets when packaging `CardVault.app`.

## Icon

Drop one of the following so the dock icon, About box, and DMG window inherit your brand:

- `icon.icns` — preferred. Multi-resolution macOS icon.
- `icon.png` — fallback. 1024 × 1024 PNG (no rounded corners; macOS clips automatically).

If neither file exists, electron-builder uses its default Electron logo. There is no error — the build still succeeds.

### Generating `icon.icns` from a 1024×1024 PNG (run on the MacBook)

```bash
mkdir build/icon.iconset
sips -z 16 16     icon.png --out build/icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out build/icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out build/icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out build/icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out build/icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out build/icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out build/icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out build/icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out build/icon.iconset/icon_512x512.png
cp icon.png             build/icon.iconset/icon_512x512@2x.png
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset
```

## DMG background (optional)

`background.png` — 540 × 380. Shown when the user double-clicks the `.dmg`. Drop it next to `icon.icns` and electron-builder picks it up.
