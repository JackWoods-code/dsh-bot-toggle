# Changelog

All notable changes to this project. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
