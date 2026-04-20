# Browser Tools

A single Chromium extension that bundles five privacy- and productivity-oriented
capabilities. Built to be auditable — every line of non-vendored code is in this
repository, no telemetry, no network calls originated by the extension.

Built for personal use. Not published to the Chrome Web Store.

## Features

| Feature                 | What it does                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab Cleaner             | Auto-closes tabs idle for more than a configurable threshold (default 60 min). Auto-exclusions: pinned, audio-playing, and tabs with unsaved form input. Per-host allowlist. Closed tabs go to a "recently closed" list in the popup — click to restore. |
| Cookie Editor           | Lists every cookie for the current site (or any URL), with inline edit, per-row delete, per-site nuke, and a confirmation-gated "delete every cookie everywhere". |
| Redirect Tracer         | Passively captures main-frame redirect chains for every tab. Click the extension icon to see the hops and HTTP status codes for the current tab; copy-to-clipboard. |
| Video Speed Controller  | Keyboard shortcuts (`S`/`D`/`Z`/`X`/`R`/`G`/`V`) for HTML5 video and audio speed, rewind, and overlay toggle. Vendored from [igrigorik/videospeed](https://github.com/igrigorik/videospeed) (MIT). |
| News Feed Eradicator    | Hides the feed on Twitter/X, YouTube, LinkedIn, Facebook, and Reddit. Per-site toggle, optional replacement banner. |

Each feature can be toggled independently from the popup.

## Install

The extension is distributed as source — you build and side-load it.

```sh
git clone https://github.com/aodhanpmoran/browser-tools.git
cd browser-tools
npm install
npm run build
```

Then in Chrome (or Edge / Brave / Arc):

1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/` directory

The extension icon appears in the toolbar. Click it to access features; the
**Options** link opens the full settings page.

### Updating

```sh
git pull
npm install
npm run build
```

Then go to `chrome://extensions` and click the reload icon on the Browser Tools
card.

## Privacy

- **No telemetry.** Nothing sends usage data anywhere.
- **No network requests** originated by this extension. It only observes
  requests your browser is already making.
- **Local storage only.** Settings, allowlists, the recently-closed log, and the
  redirect-trace buffer all live in `chrome.storage.local` or
  `chrome.storage.session` — never synced to any Chrome account, never uploaded.
- **Cookie access is on-demand.** The cookie editor reads cookies only when you
  open the popup or options page. Nothing is logged.

## Permissions

| Permission          | Used by                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| `storage`           | Settings, allowlists, recently-closed log, redirect chains.                          |
| `tabs`              | Tab Cleaner — enumerate tabs, detect pinned/audible, close tabs.                     |
| `alarms`            | Tab Cleaner — periodic inactivity sweep (survives service-worker sleep).             |
| `cookies`           | Cookie Editor — list / edit / delete cookies.                                        |
| `webRequest`        | Redirect Tracer — observe (not block) main-frame redirects.                          |
| `webNavigation`     | Redirect Tracer — committed-navigation signal.                                       |
| `host_permissions: <all_urls>` | Cookie Editor needs this for full cookie access; content scripts for NFE, VSC, and the dirty-input detector run on http / https sites. |

MV3 does **not** allow `webRequestBlocking` outside enterprise policy — this
extension only observes, never blocks.

## Architecture

Source organised per feature under `src/features/<feature>/`. Shared plumbing
in `src/shared/`:

- `feature.ts` — `Feature` interface and `FeatureId` union
- `storage.ts` — typed wrappers over `chrome.storage.local` with deep-merge defaults
- `messaging.ts` — typed `sendMessage` / `registerMessageHandler`

The service worker registers every event listener synchronously at top-level —
required in MV3 so the wake-up event that revives an idle service worker is
actually delivered. Each handler checks the relevant feature's enabled flag
before doing work.

## Development

```sh
npm run dev         # vite in watch mode; reload the extension in chrome://extensions after each change
npm run build       # production build to dist/
npm run test        # vitest unit tests
npm run typecheck   # tsc --noEmit
```

Unit tests live in `tests/unit/`. Vitest is scoped to that directory via
`vitest.config.ts` to avoid running the vendored VSC test suite.

## Updating the Video Speed Controller fork

```sh
git subtree pull --prefix=src/features/video-speed/upstream \
  https://github.com/igrigorik/videospeed.git master --squash
npm run build
```

Then manually test video sites before committing.

## License

MIT — see [LICENSE](./LICENSE). The `src/features/video-speed/upstream/`
subdirectory is vendored from an MIT-licensed project; its original LICENSE is
preserved in place. See `vendor/videospeed-NOTICE.md` for attribution and
integration details.

The News Feed Eradicator feature concept is inspired by
[jordwest/news-feed-eradicator](https://github.com/jordwest/news-feed-eradicator)
(AGPL-3.0) but this implementation is an original, MIT-licensed work — no
AGPL-3.0 source from that project is included here.
