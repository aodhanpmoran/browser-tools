export interface SiteRule {
  id: string;
  label: string;
  hostPatterns: readonly string[];
  hideSelectors: readonly string[];
  extraCss?: string;
  replacement?: string;
  // If the current pathname matches any of these regexes, the entire page is
  // blocked (body hidden, full-screen overlay shown) instead of just hiding
  // feed selectors. Feed DOM keeps drifting; full-page block is the durable fix.
  blockPaths?: readonly RegExp[];
}

export const SITE_RULES: readonly SiteRule[] = [
  {
    id: 'twitter',
    label: 'Twitter / X',
    hostPatterns: ['x.com', 'twitter.com'],
    hideSelectors: [
      'div[aria-label="Timeline: Your Home Timeline"]',
      'div[aria-label="Timeline: Trending now"]',
      'aside[aria-label="Trending"]',
      'section[aria-labelledby="accessible-list-1"]',
    ],
    replacement: 'Your feed is hidden. Search for what you came for.',
    blockPaths: [/^\/$/, /^\/home\/?$/, /^\/i\/(?:trending|topics)/],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hostPatterns: ['www.youtube.com'],
    hideSelectors: [
      // Homepage feed
      'ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer',
      'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer',
      // Sidebar / watch-next suggestions
      'ytd-watch-next-secondary-results-renderer',
      '#related',
      // Subscriptions feed
      'ytd-browse[page-subtype="subscriptions"] ytd-section-list-renderer',
      // End-screen overlays on the player
      '.ytp-ce-element',
      '.ytp-ce-covering-overlay',
      '.ytp-ce-element-shadow',
      '.ytp-endscreen-content',
      '.ytp-pause-overlay',
      // Shorts shelves (home, subs, search) and Shorts nav entries
      'ytd-rich-shelf-renderer[is-shorts]',
      'ytd-reel-shelf-renderer',
      'ytd-reel-item-renderer',
      'ytd-guide-entry-renderer:has(a[title="Shorts"])',
      'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
      'a[title="Shorts"]',
      // Shorts tab on channel pages
      'tp-yt-paper-tab:has(> .tab-content:is([aria-label*="Shorts"]))',
    ],
    extraCss: `
      /* Black homepage — hide residual chrome behind the hidden feed */
      ytd-browse[page-subtype="home"] { background: #0f0f0f !important; }
      ytd-browse[page-subtype="home"] ytd-rich-section-renderer { display: none !important; }
      /* Wider video player — reclaim space from the hidden sidebar in the default (non-theater) watch layout */
      ytd-watch-flexy:not([fullscreen]) #primary.ytd-watch-flexy,
      ytd-watch-flexy:not([fullscreen]) #primary-inner.ytd-watch-flexy {
        max-width: none !important;
        width: 100% !important;
      }
      ytd-watch-flexy:not([fullscreen]) #columns.ytd-watch-flexy {
        max-width: none !important;
      }
      ytd-watch-flexy:not([fullscreen]) #secondary.ytd-watch-flexy {
        display: none !important;
      }
    `,
    replacement: 'Homepage and recommendations hidden. Search or go to a subscription.',
    blockPaths: [/^\/$/, /^\/feed\/(?:trending|explore|subscriptions)?\/?$/, /^\/shorts\//],
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    hostPatterns: ['www.linkedin.com'],
    hideSelectors: [
      'main[role="main"] .scaffold-finite-scroll',
      'main[role="main"] .feed-shared-news-module',
      '.feed-shared-update-list',
      'section[data-urn*="urn:li:activity"]',
    ],
    replacement: 'Feed hidden. Use search or go to a specific profile.',
    blockPaths: [/^\/$/, /^\/feed\/?/, /^\/notifications\/?/, /^\/mynetwork\/?/],
  },
  {
    id: 'facebook',
    label: 'Facebook',
    hostPatterns: ['www.facebook.com'],
    hideSelectors: [
      'div[role="feed"]',
      'div[aria-label="News Feed"]',
      'div[aria-label="Stories"]',
      'div[data-pagelet="Stories"]',
    ],
    replacement: 'Feed hidden. Use search or go to a specific page or group.',
    blockPaths: [/^\/$/, /^\/home/, /^\/watch/, /^\/reel/],
  },
  {
    id: 'reddit',
    label: 'Reddit',
    hostPatterns: ['www.reddit.com', 'old.reddit.com'],
    hideSelectors: [
      'shreddit-feed',
      '[data-testid="post-container"]',
      '#siteTable',
      'div[data-testid="frontpage-sidebar"]',
    ],
    replacement: 'Reddit feed hidden. Go to a specific subreddit.',
    blockPaths: [/^\/$/, /^\/r\/(popular|all)\/?$/, /^\/best\/?/, /^\/hot\/?/, /^\/top\/?/, /^\/new\/?/, /^\/rising\/?/],
  },
];

export function findRuleForHost(hostname: string): SiteRule | null {
  for (const rule of SITE_RULES) {
    if (rule.hostPatterns.includes(hostname)) return rule;
  }
  return null;
}

export function allHostPatterns(): string[] {
  return SITE_RULES.flatMap((r) => r.hostPatterns.map((host) => `*://${host}/*`));
}
