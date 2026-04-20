# Video Speed Controller — vendored fork

Upstream: https://github.com/igrigorik/videospeed
License: MIT — see `src/features/video-speed/upstream/LICENSE`
Vendor method: `git subtree` from the `master` branch.

## Why vendored

Privacy-motivated: so the code running in every page is auditable in this
repository rather than pulled from a third-party extension.

## How it's integrated

- VSC's two content script entries (`content-bridge.js` in ISOLATED world,
  `inject-entry.js` in MAIN world) are declared in our `manifest.config.ts`
  and bundled by Vite's rollup pipeline — no changes to VSC's source.
- Feature toggle: our `videoSpeedFeature` writes `{ enabled: true|false }` to
  `chrome.storage.sync`. VSC's `content-bridge.js` already reads this global
  flag (see its `init()` — `settings.enabled === false` triggers abort) and
  reacts to `chrome.storage.onChanged` with teardown / reinit.
- VSC uses `chrome.storage.sync` for its settings; we use
  `chrome.storage.local`. Separate namespaces — no conflicts.
- VSC's own popup and options pages are **not** exposed through our extension.
  Default keybindings apply; advanced config is not currently surfaced.

## Updating

```sh
git subtree pull --prefix=src/features/video-speed/upstream \
  https://github.com/igrigorik/videospeed.git master --squash
```

Review the changes, rebuild, and retest before merging.
