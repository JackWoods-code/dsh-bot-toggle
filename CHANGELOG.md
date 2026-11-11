# Changelog

All notable changes to this project. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.4] — 2026-11-11

### Fixed

- **ds-bot 0.3.2 settings item**: 0.3.2 renamed the account-menu settings item from
  `Bot settings` to `Settings` (本地化文案「设置」), so the previous matcher missed it and the
  switch fell through to the full-page-reload fallback. The settings item is now matched by
  `设置 / Settings` (covering ds-bot 0.2.x–0.3.2), the `errNoMenu` guidance lists both labels,
  and a DOM-stub regression test walks the whole Bot → classic chain for the old and the new
  label.
- **Keyboard shortcut on macOS**: the hotkey used to be matched with `event.key === "b"`,
  but on macOS Option is a character modifier — `⌥⇧B` reports `key: "ı"`, so the shortcut
  never fired there (it only worked on Windows, where Alt leaves the character alone).
  Matching is now done on the physical key (`event.code === "KeyB"`), which is independent
  of keyboard layout and of what the modifier produces; macOS additionally accepts `⌘⇧B`.
- Tooltips now name the platform's own modifiers: `⌥⇧B / ⌘⇧B` on macOS, `Alt+Shift+B`
  elsewhere.
- Held keys (auto-repeat) and keystrokes typed while an input method is composing are
  ignored, so holding the shortcut no longer flips the surface back and forth.

## [0.4.3] — 2026-11-08

### Added

- **Top-bar entry**: an "ADE" button injected next to the ds-bot side-panel brand
  (`.bt-side-top`, narrow rail falls back to `.bt-rail-top`) for one-click switching,
  re-inserted by the 500 ms refresh tick if React re-renders it away.
- **Flicker-free switching (stealth mode)**: while switching to the classic surface the
  account menu and settings layer are forced to `display:none` (they stay in the DOM so
  programmatic clicks still work) and restored 400 ms after the switch; on failure an
  Escape key burst closes any leftover popover.
- **Last-resort fallback**: when both DOM paths fail, write ds-bot's own persisted key
  `localStorage["ds-bot:surface"]` and reload the page (ds-bot reads it on startup).

### Changed

- **ds-bot 0.3.x adaptation**: the switch entry moved from the account menu to
  *Bot settings → General → Classic Agent mode → Switch*. Menu items and buttons are now
  matched by their text, and the old "last menu item" fallback (which clicked
  "Sign in to DeepSeek" and opened the login page) is removed.
- Compatibility map records `0.2.1-rc.4` and `0.2.2-rc.1` as tested.

## [0.4.1] - 2026-10-27

- Add real-interface screenshots (Bot surface / classic surface) and `screenshots.json`.
- Keep screenshots out of the published plugin tarball.
- Document the switch in both READMEs with the new screenshots.

## [0.4.0] — 2026-10-27

### Added

- Bilingual UI strings (Chinese / English), picked from the page's `<html lang>` or the browser
  language.
- ds-bot compatibility probe: reports whether ds-bot is loaded and, when obtainable, its version.
  When ds-bot's controls are missing, the capsule turns amber and explains the problem instead of
  silently disappearing; `status().dsBot.compatible` exposes the result.
- `__botToggle.probe()` debug entry.
- DOM-stub smoke tests (`npm test`, `node --test`, no third-party dependencies).
- GitHub Actions CI (syntax check + smoke tests).
- Bilingual READMEs, PNG/SVG icon, this changelog.

## [0.3.0] — 2026-10-27

### Changed

- Renamed the package to `dsh-bot-toggle` (plugin row `bot-toggle`, storage key
  `dsh-bot-toggle:pos`, debug object `__botToggle`, log prefix `[bot-toggle]`).
- Added `LICENSE` (MIT), `author`, `repository`, `homepage` and `bugs` metadata.
- Removed leftover references to other theme plugins.

## [0.2.3] — 2026-10-27

### Changed

- Narrowed the capsule (54 px segments) per feedback.

## [0.2.2] — 2026-10-27

### Changed

- Sized the capsule to 1.5× the initial design instead of 2×.

## [0.2.1] — 2026-10-27

### Changed

- Doubled the capsule size and renamed the two labels to `Bot` / `ADE`.

## [0.2.0] — 2026-10-27

### Added

- Redesigned as a two-segment capsule: icons + labels, sliding thumb, frosted background.
- Hover/focus tooltip with the keyboard shortcut; error tooltip with a short shake.
- Idle fade after 4 s, drag + edge snapping, right-click position reset.
- Busy breathing animation while switching; respects `prefers-reduced-motion`.

## [0.1.0] — 2026-10-27

### Added

- First prototype: two plain buttons (`SOLO` / `IDE`) that switch the ds-bot surface.

[0.4.0]: https://github.com/JackWoods-code/dsh-bot-toggle/releases/tag/v0.4.0
