import { findRuleForHost, type SiteRule } from './rules';
import { getSettings } from '../../shared/storage';

let lastKey = '';

const STYLE_ID = 'browser-tools-nfe-style';
const BANNER_ID = 'browser-tools-nfe-banner';
const BLOCK_ID = 'browser-tools-nfe-block';
const BLOCK_STYLE_ID = 'browser-tools-nfe-block-style';

void apply();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) void apply();
});

// LinkedIn (and friends) are SPAs — pathname can change without a full page
// load, so re-evaluate on history pushes/pops.
// The isolated world never sees the page's own history.pushState calls, so use
// the Navigation API where available.
const nav = (window as unknown as { navigation?: EventTarget }).navigation;
// currententrychange fires on every same-document URL change, including
// intercepted navigations that later fail (navigatesuccess would miss those).
nav?.addEventListener('currententrychange', () => void apply());
window.addEventListener('popstate', () => void apply());


async function apply(): Promise<void> {
  if (!chrome.runtime?.id) return; // orphaned after an extension reload
  const rule = findRuleForHost(location.hostname);
  if (!rule) return;

  const settings = await getSettings();
  const featureOn = settings.enabled['news-feed-eradicator'];
  const siteOn = settings.newsFeedEradicator.sitesEnabled[rule.id] ?? true;
  const showBanner = settings.newsFeedEradicator.showReplacement;

  const active = featureOn && siteOn;
  const blocked = active && pathMatches(rule, location.pathname);
  const key = `${active}|${blocked}|${showBanner}`;
  // Skip the remove/re-inject cycle (and its flash) when nothing changed and
  // the injected nodes are still in the DOM.
  if (key === lastKey && injectedPresent(active, blocked)) return;
  lastKey = key;

  removeStyle();
  removeBanner();
  removeBlock();

  if (!active) return;

  if (blocked) {
    injectBlock(rule);
    return;
  }

  injectStyle(rule.hideSelectors, rule.extraCss);
  if (showBanner && rule.replacement) {
    injectBanner(rule.replacement);
  }
}

function injectedPresent(active: boolean, blocked: boolean): boolean {
  if (!active) {
    return !document.getElementById(STYLE_ID) && !document.getElementById(BLOCK_STYLE_ID);
  }
  return blocked
    ? !!document.getElementById(BLOCK_STYLE_ID)
    : !!document.getElementById(STYLE_ID);
}

function pathMatches(rule: SiteRule, pathname: string): boolean {
  if (!rule.blockPaths) return false;
  return rule.blockPaths.some((re) => re.test(pathname));
}

function injectStyle(selectors: readonly string[], extraCss?: string): void {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  const hideRule = `${selectors.join(',\n')} { display: none !important; }`;
  style.textContent = extraCss ? `${hideRule}\n${extraCss}` : hideRule;
  (document.head || document.documentElement).appendChild(style);
}

function removeStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function injectBanner(message: string): void {
  const ensureBanner = () => {
    if (document.getElementById(BANNER_ID)) return;
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.textContent = message;
    Object.assign(banner.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      zIndex: '2147483647',
      padding: '10px 16px',
      background: 'rgba(30, 30, 30, 0.92)',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      textAlign: 'center',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    (document.body || document.documentElement).appendChild(banner);
  };
  if (document.body) {
    ensureBanner();
  } else {
    document.addEventListener('DOMContentLoaded', ensureBanner, { once: true });
  }
}

function removeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
}

function injectBlock(rule: SiteRule): void {
  // Hide everything below us so feed DOM rendering can't leak through.
  const style = document.createElement('style');
  style.id = BLOCK_STYLE_ID;
  style.textContent = `html, body { background: #0f0f0f !important; }
    body > *:not(#${BLOCK_ID}) { display: none !important; }`;
  (document.head || document.documentElement).appendChild(style);

  const ensureOverlay = () => {
    if (document.getElementById(BLOCK_ID)) return;
    const overlay = document.createElement('div');
    overlay.id = BLOCK_ID;
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '14px',
      padding: '32px',
      background: '#0f0f0f',
      color: '#f4f4f4',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('div');
    title.textContent = `${rule.label} is blocked here.`;
    Object.assign(title.style, {
      fontSize: '22px',
      fontWeight: '600',
      letterSpacing: '-0.01em',
    } satisfies Partial<CSSStyleDeclaration>);

    const sub = document.createElement('div');
    sub.textContent = rule.replacement ?? 'This page is blocked.';
    Object.assign(sub.style, {
      fontSize: '14px',
      color: '#a0a0a0',
      maxWidth: '420px',
      lineHeight: '1.45',
    } satisfies Partial<CSSStyleDeclaration>);

    const back = document.createElement('button');
    back.textContent = 'Go back';
    Object.assign(back.style, {
      marginTop: '8px',
      padding: '8px 16px',
      borderRadius: '8px',
      border: '1px solid #333',
      background: '#1a1a1a',
      color: '#f4f4f4',
      fontSize: '13px',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    back.addEventListener('click', () => {
      if (history.length > 1) history.back();
      else location.href = 'about:blank';
    });

    overlay.appendChild(title);
    overlay.appendChild(sub);
    overlay.appendChild(back);
    (document.body || document.documentElement).appendChild(overlay);
  };

  if (document.body) {
    ensureOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', ensureOverlay, { once: true });
  }
}

function removeBlock(): void {
  document.getElementById(BLOCK_ID)?.remove();
  document.getElementById(BLOCK_STYLE_ID)?.remove();
}

