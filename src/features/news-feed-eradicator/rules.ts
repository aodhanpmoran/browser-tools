export interface SiteRule {
  id: string;
  label: string;
  hostPatterns: readonly string[];
  hideSelectors: readonly string[];
  replacement?: string;
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
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hostPatterns: ['www.youtube.com'],
    hideSelectors: [
      'ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer',
      'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer',
      'ytd-watch-next-secondary-results-renderer',
      '#related',
      'ytd-browse[page-subtype="subscriptions"] ytd-section-list-renderer',
    ],
    replacement: 'Homepage and recommendations hidden. Search or go to a subscription.',
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
