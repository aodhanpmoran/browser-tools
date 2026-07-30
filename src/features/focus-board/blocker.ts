/**
 * Site blocking for an active focus session.
 *
 * Two mechanisms, because one cannot cover everything:
 *
 * 1. declarativeNetRequest dynamic rules handle http/https. They redirect
 *    main-frame navigations to the block page. This is enforced by the network
 *    stack, so it holds even if the service worker is asleep.
 * 2. A tabs.onUpdated guard handles `chrome://` pages. Extensions are forbidden
 *    from filtering chrome:// URLs at the network layer, so the only lever is
 *    to notice the navigation and steer the tab away. That is a speed bump,
 *    not a lock — see the options-panel copy, which says so to the user.
 */

/** Dynamic rule IDs live in a private range so we never clobber another feature's. */
export const RULE_ID_BASE = 9000;
/** Keeps the rule set well inside Chrome's dynamic-rule budget. */
export const MAX_BLOCKED_SITES = 200;

export const BLOCK_PAGE = 'src/features/focus-board/blocked.html';

/** chrome:// surfaces that would let you switch the blocker off mid-session. */
const GUARDED_PREFIXES = [
  'chrome://extensions',
  'chrome://settings',
  'chrome://flags',
  'about:addons',
  'edge://extensions',
  'brave://settings',
];

/**
 * Reduces whatever the user typed to a bare registrable hostname:
 * `https://www.YouTube.com/feed` and `*.youtube.com` both become `youtube.com`.
 * Returns null for anything that is not plausibly a hostname.
 */
export function normaliseSite(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '');
  s = s.replace(/^\*\./, '');
  s = s.replace(/^www\./, '');
  s = s.split(/[/?#]/)[0] ?? '';
  s = s.replace(/:\d+$/, '');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(s)) {
    return null;
  }
  return s;
}

/** Normalises a whole list, dropping junk and duplicates but keeping order. */
export function normaliseSites(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const site = normaliseSite(entry);
    if (site && !seen.has(site)) {
      seen.add(site);
      out.push(site);
    }
  }
  return out.slice(0, MAX_BLOCKED_SITES);
}

/**
 * One redirect rule per site. `||site^` matches the domain and every subdomain,
 * so one entry covers `youtube.com`, `www.youtube.com` and `m.youtube.com`.
 */
export function buildRules(
  sites: readonly string[],
  blockPageUrl: string,
): chrome.declarativeNetRequest.Rule[] {
  return sites.map((site, i) => ({
    id: RULE_ID_BASE + i,
    priority: 1,
    action: {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: { url: `${blockPageUrl}?from=${encodeURIComponent(site)}` },
    },
    condition: {
      urlFilter: `||${site}^`,
      resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
    },
  }));
}

/** True when this URL is a settings surface we hide during a session. */
export function isGuardedUrl(url: string, ownOptionsUrl: string): boolean {
  const u = url.toLowerCase();
  if (GUARDED_PREFIXES.some((prefix) => u.startsWith(prefix))) return true;
  // Our own options page is guarded too — otherwise turning the blocker off is
  // one click away and the session means nothing.
  return u.startsWith(ownOptionsUrl.toLowerCase());
}

/**
 * Installs or tears down the network rules. Always clears our whole ID range
 * first, so a shrunk list never leaves an orphan rule behind.
 */
export async function applyNetworkRules(sites: readonly string[]): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((r) => r.id >= RULE_ID_BASE && r.id < RULE_ID_BASE + MAX_BLOCKED_SITES)
    .map((r) => r.id);
  const addRules = buildRules(sites, chrome.runtime.getURL(BLOCK_PAGE));
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

export async function clearNetworkRules(): Promise<void> {
  await applyNetworkRules([]);
}

/** Steers an already-open guarded tab to the block page. */
export async function divertTab(tabId: number, reason: string): Promise<void> {
  const url = `${chrome.runtime.getURL(BLOCK_PAGE)}?from=${encodeURIComponent(reason)}`;
  try {
    await chrome.tabs.update(tabId, { url });
  } catch {
    // Tab closed mid-flight, or Chrome refused the navigation. Nothing to do.
  }
}
