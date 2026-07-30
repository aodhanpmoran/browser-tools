# Browser Tools

A single Chromium MV3 extension bundling privacy/productivity features. Personal use,
not published to the Chrome Web Store. Auditable — no telemetry, no network calls the
extension didn't initiate itself (e.g. Now Playing's optional ACRCloud lookup).

GitHub: `aodhanpmoran/browser-tools` (origin/main is the source of truth).

## Commands

```sh
npm run dev         # vite dev server with HMR, load dist/ as unpacked extension
npm run build        # production build to dist/
npm test             # vitest run
npm run test:watch
npm run typecheck    # tsc --noEmit
```

## Architecture

Each feature lives in `src/features/<name>/` and implements the `Feature` interface
(`onInstall`/`onEnable`/`onDisable`) from `src/shared/feature.ts`. Feature IDs, labels,
and descriptions are registered in `FEATURE_IDS`/`FEATURE_META` in that same file —
adding a feature means adding it there plus a settings shape in `src/shared/storage.ts`
(`Settings` interface + `DEFAULT_SETTINGS`).

- `src/shared/storage.ts` — single `chrome.storage.local` blob under key `settings`,
  deep-merged against `DEFAULT_SETTINGS` so new fields don't break existing installs.
  Use `getSettings`/`patchSettings`/`setFeatureEnabled`/`onSettingsChanged`, never touch
  `chrome.storage` directly. Bulk feature *data* (as opposed to settings) lives under its
  own `chrome.storage.local` key behind a module that owns it — `nowPlayingHistory`
  (`now-playing/history.ts`) and `focusBoard` (`focus-board/store.ts`). Keep it out of the
  settings blob so a deep-merge never has to reconcile a list.
- `src/shared/messaging.ts` — typed request/response wrapper over
  `chrome.runtime.sendMessage`. Use `registerMessageHandler`/`sendMessage` instead of
  raw `chrome.runtime.onMessage`.
- `src/background/service-worker.ts` — MV3 background entrypoint, wires up
  feature lifecycle and alarms.
- `src/popup/`, `src/options/` — popup and full options page UI (vanilla TS + CSS,
  no framework).
- `manifest.config.ts` — MV3 manifest built with `@crxjs/vite-plugin`'s
  `defineManifest`. Content script matches/permissions live here.

## Features (10)

| Feature | Dir | Notes |
|---|---|---|
| Tab Cleaner | `tab-cleaner` | idle-tab auto-close, allowlist, undo via recently-closed |
| Cookie Editor | `cookie-editor` | list/edit/delete/nuke cookies per site |
| Redirect Tracer | `redirect-tracer` | passive per-tab redirect chain capture |
| Video Speed Controller | `video-speed/upstream` | vendored subtree from `igrigorik/videospeed` (MIT) — don't hand-edit, see below |
| News Feed Eradicator | `news-feed-eradicator` | MIT reimplementation (not a fork of the AGPL original); per-site toggles |
| Google Unhobble | `google-unhobble` | restores Maps tab / View-Image button EU users lose |
| Now Playing | `now-playing` | MediaSession/DOM/title detection, optional ACRCloud audio-fingerprint fallback, local history |
| Picture-in-Picture | `picture-in-picture` | one-click pop-out of largest `<video>` |
| Image Picker | `image-picker` | scan page/link for images, pick and download |
| Focus Board | `focus-board` | Basecamp-ish to-dos: hard cap of 3 for Today, one starred "The One", subtasks, per-task timer, site blocking while a session runs, daily agent suggestions |

## Gotchas

- **crxjs content-script basename collision**: `@crxjs/vite-plugin` v2.4.0 emits one
  chunk per `content_scripts` entry keyed by `basename(file)`. Two entries with the same
  basename (e.g. two files both named `content.ts`) silently dedupe at bundle time and
  the plugin throws a confusing `Content script fileName is undefined: "<path>"` for
  whichever one lost — looks like a missing file, isn't. **Always give each
  `content_scripts` entry a unique filename**, prefixed with the feature name (see
  `google-unhobble.content.ts`, `now-playing.content.ts`). Same rule applies to
  `all_frames`/`MAIN`-world injected JS.
- **`chrome://` pages cannot be blocked by any extension.** `declarativeNetRequest` will
  not match them and content scripts cannot run there, so Focus Board's "lock
  chrome://extensions" guard is a `tabs.onUpdated` watcher that navigates the tab to the
  block page after the fact (`focus-board/blocker.ts`). It is friction, not enforcement —
  removing the extension via the toolbar right-click menu bypasses it entirely. Don't
  "fix" this by reaching for DNR; the platform forbids it. Real enforcement needs an OS
  managed-policy profile (`ExtensionInstallForcelist`), which is outside the extension.
- Focus Board's dynamic DNR rules live in the fixed ID range `9000..9200`
  (`RULE_ID_BASE`/`MAX_BLOCKED_SITES`). Any other feature adding dynamic rules must pick a
  different range — `applyNetworkRules` clears its whole range on every write.
- Focus Board reads daily suggestions from a JSON file written by an outside
  scheduled agent (`docs/suggestions-agent.md`), because the extension cannot reach
  Fathom or Gmail — those are desktop MCP connectors with no in-browser route. The agent
  must run **locally** (launchd + `scripts/refresh-suggestions.sh`); a cloud routine has
  no access to this machine's filesystem and cannot write the file. Reading
  it needs `file:///*` in `host_permissions` **and** the per-extension "Allow access to
  file URLs" toggle, which only the user can tick.
- `file://` probes must be time-boxed. A `file://` directory listing returns
  `status: 0` (so `res.ok` is meaningless there) and `/home` on macOS is an autofs
  automount that never answers — an un-timed fetch to it hangs forever. See
  `fetchWithTimeout` in `focus-board/suggestions.ts`. Chrome also renders listings as
  `addRow(name, url, isdir, ...)` script calls, not `<a href>` markup.
- `src/features/video-speed/upstream/` is a vendored git subtree of the upstream
  `videospeed` repo (merged in via `2dcfc70`). Treat it as third-party code — patch
  narrowly and keep in mind re-vendoring will overwrite local edits.
- `npm test` sometimes does not exit when run without a TTY (backgrounded, piped, or
  from an agent), even though every test has already passed — it hangs after printing
  the summary. Use `CI=true npx vitest run` in those contexts. A "timed out" test run is
  usually this, not a failure; read the output before believing the exit code. Note also
  that `--reporter=basic` does not exist in vitest 4 and errors out; `dot` does.

## State as of 2026-07-30

`origin/main` is at `4263d2f`. Everything since then is on **`feat/focus-board`**,
pushed, and open as **PR #1** — reviewed by nobody yet, **not merged**. Working tree
clean. Four commits on the branch, each building green on its own:

| Commit | What |
|---|---|
| `2ce5cbf` | Image Picker — Aodhán's work, sitting uncommitted since 6 Jul, committed as-is |
| `ee8379e` | Focus Board — board, timer, site blocking |
| `f3f58e6` | Focus Board — daily suggestions read from a local JSON file |
| `7f7d2fa` | Focus Board — launchd job that writes that file |

Verification at the branch tip: `npm run typecheck` clean, `npm test` 98 passing,
`npm run build` clean. Focus Board was also driven end to end in Chromium with the
extension loaded (cap enforcement, star reassignment, subtask progress, countdown,
site + subdomain blocking, `chrome://` diversion, suggestion accept/dismiss,
persistence across reload).

### Open threads

- **Image Picker is untested.** It typechecks and builds and its commit is honest
  about this, but nobody has exercised the scan/download path. Worth a manual pass
  before merging PR #1.
- **One manual step is still outstanding**, and only the user can do it: tick
  *Allow access to file URLs* on the extension's card in `chrome://extensions`, then
  Settings → Focus Board → **Detect**. Until then the Suggested section stays hidden,
  because reading `~/.browser-tools/suggestions.json` is blocked. This is not a bug to
  go hunting for.
- PR #1 has no reviewer and no merge deadline set.

### Things living outside this repo

- `~/Library/LaunchAgents/com.aodhanpmoran.browser-tools-suggestions.plist` — loaded,
  fires daily at 07:00 local, runs `scripts/refresh-suggestions.sh`. The plist
  hardcodes `/Users/aodhanpmoran` paths, so it does not travel to another machine
  as-is.
- `~/.browser-tools/` — `suggestions.json` (real output; first run wrote 5 items
  scored 9/8/6/6/2), plus `refresh.log` and `launchd.{out,err}.log`.
- A Chrome for Testing instance may still be running against `dist/` with a persistent
  profile at `~/.browser-tools-chrome`. Chrome 150 removed the `--load-extension` CLI
  flag, so the user's normal Chrome cannot be driven that way — load `dist/` through
  `chrome://extensions` → Load unpacked instead. The Chrome for Testing binary lives
  under `~/Library/Caches/ms-playwright/chromium-1228/`.

### Deliberate design decisions, so they are not "fixed" later

- **The three-task cap is the feature**, enforced in `focus-board/store.ts`, not just
  the UI. Do not add an escape hatch.
- **Suggestions never auto-enter Today.** Accepting one by hand is the moment it earns
  a slot. An agent must not spend the cap.
- **`chrome://extensions` blocking is friction, not enforcement**, and cannot be made
  otherwise from inside an extension. See the Gotchas section.
- **The suggestions agent must run locally.** A cloud routine cannot write to this
  machine. See `docs/suggestions-agent.md`.
