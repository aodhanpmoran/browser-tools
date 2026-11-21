import type { FoundImage } from './scan';

/**
 * Runs in the target page via chrome.scripting.executeScript. Must be fully
 * self-contained — no imports or outer-scope references survive serialization.
 * Collects live-DOM <img> elements (resolving currentSrc/srcset) plus og/twitter
 * and link-rel images from the head. Returns absolute URLs, deduped in order.
 */
export function collectImagesInPage(): FoundImage[] {
  const seen = new Set<string>();
  const out: FoundImage[] = [];

  const add = (url: string | null | undefined, source: 'img' | 'meta', alt?: string): void => {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return;
    let abs: string;
    try {
      abs = new URL(trimmed, document.baseURI).href;
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(alt ? { url: abs, source, alt } : { url: abs, source });
  };

  for (const img of Array.from(document.images)) {
    // currentSrc reflects the browser's actual srcset/DPR choice when loaded.
    add(img.currentSrc || img.src, 'img', img.alt || undefined);
  }

  for (const el of Array.from(
    document.querySelectorAll<HTMLMetaElement>(
      'meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"], meta[name="twitter:image:src"]',
    ),
  )) {
    add(el.content, 'meta');
  }

  for (const el of Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]'),
  )) {
    add(el.href, 'meta');
  }

  return out;
}
