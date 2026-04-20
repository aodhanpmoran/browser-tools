import type { TabActivity } from './activity';
import type { TabCleanerSettings } from '../../shared/storage';

export interface ExclusionContext {
  tab: chrome.tabs.Tab;
  activity: TabActivity | undefined;
  settings: TabCleanerSettings;
  activeTabIdInWindow: number | undefined;
}

export function isExcluded(ctx: ExclusionContext): boolean {
  const { tab, activity, settings, activeTabIdInWindow } = ctx;

  if (tab.id === undefined || tab.id === chrome.tabs.TAB_ID_NONE) return true;
  if (tab.id === activeTabIdInWindow) return true;
  if (settings.excludePinned && tab.pinned) return true;
  if (settings.excludeAudible && tab.audible) return true;
  if (settings.excludeDirtyInput && activity?.hasDirtyInput) return true;
  if (tab.url && matchesAllowlist(tab.url, settings.allowlist)) return true;
  return false;
}

export function matchesAllowlist(url: string, allowlist: readonly string[]): boolean {
  const hostname = safeHost(url);
  if (!hostname) return false;
  for (const entry of allowlist) {
    if (hostMatches(hostname, entry)) return true;
  }
  return false;
}

function hostMatches(hostname: string, pattern: string): boolean {
  const normalized = pattern.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('*.')) {
    const suffix = normalized.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === normalized;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
