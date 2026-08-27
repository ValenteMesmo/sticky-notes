# Sticky Notes

A fast, transparent, always-on-top replacement for Microsoft Sticky Notes built
with [Tauri v2](https://tauri.app). Notes float over your whole screen; the
empty background is **click-through**, so it never blocks the apps underneath
— but you can still click, drag, and type on the notes themselves.

## Motivation

Microsoft Sticky Notes has gotten slow and clunky. This project exists to
replace it with something lightweight and "juicy": instant Web Audio sound
effects, spawn/delete animations, color themes, and true productivity
hotkeys. The whole window covers your monitor but ignores mouse clicks outside
of notes, so it feels like floating notes, not a blocking window.

## Features

- **Click-through background** – the empty area passes clicks to windows
  below; only notes capture the mouse (via `setIgnoreCursorEvents`, driven by a
  cursor-position poll).
- **Always on top**, borderless, transparent, full-screen covering the monitor.
- **7 note colors** (yellow, pink, blue, green, purple, orange, white).
- **Drag** notes by their header; auto-resizing textarea.
- **Juice** – spawn/delete animations, particles, ripples, and Web Audio synth
  sounds (type, pop, delete, click, color).
- **Persistence** – notes are saved to `localStorage`.

### Hotkeys

| Keys | Action |
|------|--------|
| `Ctrl+N` | New note |
| `Ctrl+W` | Delete the note in focus |
| `Ctrl+Q` | Close the app |

Closing the last note closes the app. The app always opens with at least one
empty, focused note ready to type.

## Requirements

- [Rust](https://rustup.rs) toolchain (edition 2021)
- [Node.js](https://nodejs.org) (v20+ recommended) and npm
- System dependencies for [Tauri v2](https://tauri.app/start/prerequisites/)
  (Windows: WebView2, MSVC build tools)

## Development

```bash
npm install
npm run dev
```

`npm run dev` starts a local static server for the frontend and launches the
Tauri app with hot-reload for Rust changes.

## Building the executable

```bash
npm run build
```

This runs `tauri build`, producing a standalone `.exe` (bundler runs
`npm run build`, so only the system dependencies listed above are required).
The binary is written to:

```
src-tauri/target/release/sticky-notes.exe
```

You can copy that single `.exe` anywhere and run it — no install needed.

## Project layout

```
src/            Frontend (plain HTML/CSS/JS, no framework, no bundler)
src/index.html
src/main.js     Notes, CRUD, click-through logic
src/style.css
src/sounds.js   Web Audio synth effects
src-tauri/      Tauri/Rust backend
src-tauri/src/
  lib.rs        App setup: cursor poll + window sizing
  main.rs       Entry point that calls the library's run()
```

## Notes

- Text communication (HTML placeholders) is localized in Portuguese (pt-BR).
- The window intentionally ignores clicks unless over a note; this is what
  makes it feel like floating notes.
