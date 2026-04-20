import { findRuleForHost } from './rules';
import { getSettings } from '../../shared/storage';

const STYLE_ID = 'browser-tools-nfe-style';
const BANNER_ID = 'browser-tools-nfe-banner';

void apply();

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void apply();
});

async function apply(): Promise<void> {
  const rule = findRuleForHost(location.hostname);
  if (!rule) return;

  const settings = await getSettings();
  const featureOn = settings.enabled['news-feed-eradicator'];
  const siteOn = settings.newsFeedEradicator.sitesEnabled[rule.id] ?? true;
  const showBanner = settings.newsFeedEradicator.showReplacement;

  removeStyle();
  removeBanner();

  if (!featureOn || !siteOn) return;

  injectStyle(rule.hideSelectors);
  if (showBanner && rule.replacement) {
    injectBanner(rule.replacement);
  }
}

function injectStyle(selectors: readonly string[]): void {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `${selectors.join(',\n')} { display: none !important; }`;
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
