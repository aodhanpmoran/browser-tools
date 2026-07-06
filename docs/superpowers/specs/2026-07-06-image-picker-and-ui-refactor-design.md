# Image Picker feature + popup/options UI refactor

Date: 2026-07-06. Approved approach: static fetch + DOMParser for pasted URLs
(Approach A); full-tab grid page; img+srcset plus OG/head images; downloads to
`Downloads/browser-tools/<hostname>/`; targeted refactor of popup.ts/options.ts
into per-feature panels first.

## Part 1 — Targeted UI refactor (no behavior change)

`src/popup/popup.ts` (682 lines) and `src/options/options.ts` (551 lines) hold
every feature's UI wiring. Split them so each feature owns its UI, mirroring how
`src/features/` is already organized.

**Contracts** in `src/shared/panel.ts`:

- `PopupPage` — `{ id, featureId, label, icon, render(container, ctx) }`. The
  popup shell renders one nav button + one page container per registered page.
  `ctx: PanelContext` carries the active tab and current settings.
- `OptionsPanel` — `{ featureId, render(enabled) => Promise<HTMLElement> }`.

**Shared DOM helpers** in `src/shared/dom.ts`: `emptyNote`, `formatAge`,
`safeHost` (currently duplicated/private in popup.ts).

**New files** (moved code, not rewritten):

- `src/features/cookie-editor/popup-panel.ts` — cookies summary page
- `src/features/redirect-tracer/popup-panel.ts` — hops page (trace render, copy)
- `src/features/now-playing/popup-panel.ts` — music page (card, hero, identify
  flow; `popup-identify.ts` stays as the capture-logic module it is)
- `src/features/picture-in-picture/popup-panel.ts` — PiP page
- `src/features/tab-cleaner/popup-panel.ts` — recently-closed section (renders
  into the home page, not its own nav page)
- `src/features/{news-feed-eradicator,video-speed,tab-cleaner,redirect-tracer,google-unhobble,now-playing,picture-in-picture}/options-panel.ts`
  — one per `renderDetails` switch arm; cookie-editor's existing
  `options-panel.ts` is the template and stays put.

**Shells after the split:**

- `popup.ts`: nav from the page registry, page containers created dynamically
  (static per-page divs leave `index.html`), home page = feature toggle list +
  tab-cleaner's home section, storage-change re-render. ~150 lines.
- `options.ts`: sidebar nav, header + enable toggle, panel registry lookup
  instead of the `renderDetails` switch. ~100 lines.

CSS stays whole (`popup.css`, `options.css`) — splitting it buys nothing here.

**Invariant:** `npm test`, `npm run typecheck` pass; built extension behaves
identically. Verified by loading `dist/` and clicking through every page.

## Part 2 — Image Picker feature

New feature `image-picker` in `src/features/image-picker/`. Feed it a link (or
use the current tab), see all associated images in a grid, download the ones
you want.

**Input modes:**

1. **Current tab** — popup page has a "Scan this tab" button. Scanning injects
   a self-contained function via `chrome.scripting.executeScript` (no manifest
   content script needed) that collects images from the live DOM.
2. **Pasted URL** — popup page has a URL field. The grid page `fetch()`es the
   URL (host permission `<all_urls>` already granted), parses with `DOMParser`,
   and extracts images from the static HTML. JS-rendered images are out of
   scope — visit the page and use mode 1 for those.

**What counts as an image** (per approved scope):

- `<img>` elements: `currentSrc`/`src`, plus the largest `srcset` candidate
  (by width descriptor, else density). Lazy-load attrs (`data-src`,
  `data-srcset`) checked as fallbacks in static mode.
- Head/meta images: `og:image`, `twitter:image`, `link rel="icon"`,
  `apple-touch-icon`.
- Not in scope: CSS backgrounds, inline SVG, `<picture>`/video posters.

**Grid page** — `src/features/image-picker/grid.html` + `grid.ts` + `grid.css`,
opened as an extension tab with query params (`?tab=<id>` or `?url=<href>`).
Thumbnail grid; per-image checkbox, dimensions (from natural size on load) and
host shown; select all / none; min-width/height filter inputs; "Download
selected (N)" button. Images that fail to load render as broken-image cards
that are excluded from select-all.

**Downloads:** `chrome.downloads.download` per selected image with
`filename: 'browser-tools/<source-hostname>/<name>'` (relative to the Downloads
dir), `conflictAction: 'uniquify'`. Filenames derived from the URL path,
sanitized; extension inferred from the path (fallback `.jpg`). Requires new
`downloads` permission in the manifest.

**Pure logic module** `src/features/image-picker/scan.ts` (unit-tested):

- `parseSrcset(srcset)` / `pickLargestSrcsetUrl(srcset)`
- `extractImagesFromHtml(html, baseUrl)` — DOMParser-based extraction returning
  `FoundImage[] { url, source: 'img' | 'meta', alt? }`, deduped by resolved URL
- `filenameForUrl(url, index)` — sanitize + fallback naming

**Wiring:** add `image-picker` to `FEATURE_IDS`/`FEATURE_META`; `index.ts`
exports a no-op-lifecycle `Feature`; register in the service-worker `REGISTRY`;
popup page panel + a note-only options panel. No persisted settings beyond the
enabled flag (filters are per-session UI state). Grid page added to Vite
`build.rollupOptions.input` so it's emitted as an extension page.

**Error handling:** fetch failures / non-HTML responses show an inline error
with the reason; scan of a chrome:// or extension page shows "can't scan this
page"; individual download failures mark the card, others proceed.

**Testing:** vitest (node env) covers `scan.ts` pure functions — srcset
parsing edge cases (width vs density, whitespace, malformed), HTML extraction
(img/srcset/lazy/og/link-rel, relative URL resolution, dedupe), filename
sanitize/dedupe. DOM-dependent grid code is exercised manually via the built
extension.
