# Browser Tools

Personal Chromium extension bundling five privacy- and productivity-oriented
capabilities into a single auditable MV3 extension.

**Status:** scaffold (M0 complete). Not yet functional.

## Features (planned)

- **Tab Cleaner** — auto-closes inactive tabs after a configurable timeout, with
  host-based exclusions, auto-exclude for pinned / audible / dirty-form tabs,
  and a recently-closed list with one-click undo.
- **Cookie Editor** — list, edit, and delete cookies for the current site;
  nuke all cookies for a site, or all cookies everywhere (double-confirm).
- **Redirect Tracer** — passively logs redirect chains for each tab; click the
  extension icon to see how you arrived at the current page.
- **Video Speed Controller** — vendored fork of
  [igrigorik/videospeed](https://github.com/igrigorik/videospeed) (MIT).
- **News Feed Eradicator** — original MIT implementation inspired by
  [jordwest/news-feed-eradicator](https://github.com/jordwest/news-feed-eradicator)
  (AGPL-3.0). Hides feeds on Twitter/X, YouTube, LinkedIn, Facebook, and Reddit
  via per-site CSS selectors.

Each feature is toggleable independently from the popup.

## Privacy

- No telemetry.
- No network requests originated by the extension.
- All data (settings, allowlists, recently-closed log) stored in
  `chrome.storage.local` — never synced, never uploaded.
- Requested permissions are minimal and scoped to the features that need them;
  each is documented below.

## Permissions

(Added per feature in subsequent milestones.)

## Development

```sh
npm install
npm run dev      # watch mode; outputs to dist/
npm run build    # production build to dist/
npm run test     # vitest unit tests
npm run typecheck
```

Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select
`dist/`.

## License

MIT. See [LICENSE](./LICENSE) and `vendor/` for upstream attribution.
