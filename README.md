# QuizRandomizer

[Русская версия](README.ru.md)

A desktop scoreboard for drawing a random number at quizzes, pub games and raffles.
The host keeps a compact control window on their screen; the board fills the second
display with a huge spinning number. Everything works offline.

![Board](docs/board.png)

## Features

- **Board on the second display** - opens full screen on a secondary monitor automatically
  (or on a monitor you pick), falls back to a draggable window when there is only one screen.
- **Drum animation** - the result is chosen up front, then the board spins through the
  numbers like a drum, slowing down towards the end. Four animation styles or random.
- **Teams** - paste a list, one per line: the range becomes 1…N and the team name
  appears under the drawn number.
- **No repeats** - drawn numbers are excluded until you reset; history is shown both in
  the control window and in the corner of the board.
- **Appearance presets** - font (any system font with search and preview, or a font file),
  colors, digit shadow, confetti colors, background pattern and logo. Presets are saved
  locally and can be exported to / imported from a single `.rpreset` file that carries
  its fonts and images along.
- **Two languages** - Russian and English UI, auto-detected from the system (switch in the
  Application section).
- Keyboard: `Space` / `Enter` starts a draw from either window, `Esc` leaves full screen,
  `F` or double-click toggles it. The control window can stay always on top.

## Download

Installers for Windows (`.exe`) and macOS (`.dmg`, Apple Silicon and Intel) are attached
to every [GitHub release](https://github.com/zhuzhavladislav/quiz-randomizer/releases).

The builds are not code-signed. On macOS right-click the app and choose **Open** the first
time; on Windows click **More info → Run anyway** in SmartScreen.

## How it works

1. Set the range (or paste teams), the spin duration and press **Start**.
2. The main process picks the result with `crypto.randomInt`, sends it to the board and
   the board animates towards it. The winner is announced a second after the drum stops:
   the number pops, confetti falls, the result is added to history.
3. Presets live in `presets.json` inside the app data folder; user files (fonts, images)
   are copied to `userData/assets` and served to the board through a private `asset://`
   scheme, so the renderer stays sandboxed. The presets shipped in `presets/` are imported
   automatically on first launch.

## Development

Requires Node.js 22.12+ (see `.nvmrc`).

```bash
npm install
npm run dev        # both windows with hot reload
npm run typecheck
npm run build      # compiles to out/
npm run dist       # installer for the current OS in release/
```

Stack: Electron + React + TypeScript + Vite (electron-vite), packaged with electron-builder.
`contextIsolation` and `sandbox` are on, the renderer talks to the main process only through
the typed bridge in `src/preload`.

```
src/main/       main process: windows, displays, IPC, settings, presets, asset scheme
src/preload/    typed window.api bridge
src/renderer/   control.html (host window) and board.html (scoreboard), React
src/shared/     types, theme model, i18n dictionaries
presets/        bundled .rpreset files, imported on first launch
build/          app icon
```

### Releasing

Pushing a `v*` tag builds installers on GitHub Actions and attaches them to a release:

```bash
npm version minor -m "v%s" && git push --follow-tags
```

### Contributing

Issues and pull requests are welcome. Keep the control window minimal and the board
readable from across a bar; UI strings go to `src/shared/i18n.ts` in both languages.

## License

[MIT](LICENSE). Bundled fonts and example presets: see [THIRD_PARTY.md](THIRD_PARTY.md).
