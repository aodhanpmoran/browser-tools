import { describe, expect, it } from 'vitest';
import {
  MAX_BLOCKED_SITES,
  buildRules,
  isGuardedUrl,
  normaliseSite,
  normaliseSites,
} from '../../src/features/focus-board/blocker';

describe('normaliseSite', () => {
  it('keeps a bare domain', () => {
    expect(normaliseSite('youtube.com')).toBe('youtube.com');
  });

  it('strips scheme, www, path, query and fragment', () => {
    expect(normaliseSite('https://www.youtube.com/feed/subscriptions?a=1#x')).toBe('youtube.com');
    expect(normaliseSite('http://reddit.com/r/productivity')).toBe('reddit.com');
  });

  it('strips a leading wildcard', () => {
    expect(normaliseSite('*.twitter.com')).toBe('twitter.com');
  });

  it('strips a port', () => {
    expect(normaliseSite('example.com:8080')).toBe('example.com');
  });

  it('lowercases and trims', () => {
    expect(normaliseSite('  YouTube.COM  ')).toBe('youtube.com');
  });

  it('keeps a real subdomain that is not www', () => {
    expect(normaliseSite('news.ycombinator.com')).toBe('news.ycombinator.com');
  });

  it('rejects entries that are not hostnames', () => {
    for (const bad of ['', '   ', 'not a domain', 'localhost', 'com', '.com', 'foo.', '///']) {
      expect(normaliseSite(bad)).toBeNull();
    }
  });
});

describe('normaliseSites', () => {
  it('drops junk and de-duplicates while preserving order', () => {
    expect(
      normaliseSites(['https://www.youtube.com/', 'youtube.com', 'garbage', '', 'reddit.com']),
    ).toEqual(['youtube.com', 'reddit.com']);
  });

  it('de-duplicates entries that only differ by www or scheme', () => {
    expect(normaliseSites(['x.com', 'https://x.com', 'www.x.com'])).toEqual(['x.com']);
  });

  it('caps the list so we stay inside the dynamic-rule budget', () => {
    const many = Array.from({ length: MAX_BLOCKED_SITES + 50 }, (_, i) => `site${i}.com`);
    expect(normaliseSites(many)).toHaveLength(MAX_BLOCKED_SITES);
  });
});

describe('buildRules', () => {
  const rules = buildRules(['youtube.com', 'reddit.com'], 'chrome-extension://abc/blocked.html');

  it('emits one main-frame redirect rule per site', () => {
    expect(rules).toHaveLength(2);
    expect(rules[0]!.condition.resourceTypes).toEqual(['main_frame']);
    expect(rules[0]!.action.type).toBe('redirect');
  });

  it('matches the domain and its subdomains via the ||host^ anchor', () => {
    expect(rules[0]!.condition.urlFilter).toBe('||youtube.com^');
  });

  it('gives each rule a distinct id', () => {
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it('passes the blocked host to the block page so it can name it', () => {
    expect(rules[1]!.action.redirect?.url).toContain('from=reddit.com');
  });

  it('produces nothing for an empty list, which is how blocking is torn down', () => {
    expect(buildRules([], 'chrome-extension://abc/blocked.html')).toEqual([]);
  });
});

describe('isGuardedUrl', () => {
  const own = 'chrome-extension://abc/src/options/index.html';

  it('guards the chrome pages that could switch the blocker off', () => {
    expect(isGuardedUrl('chrome://extensions/', own)).toBe(true);
    expect(isGuardedUrl('chrome://extensions/?id=abc', own)).toBe(true);
    expect(isGuardedUrl('chrome://settings/', own)).toBe(true);
    expect(isGuardedUrl('chrome://flags', own)).toBe(true);
  });

  it('guards its own options page, so blocking cannot be disabled mid-session', () => {
    expect(isGuardedUrl(own, own)).toBe(true);
    expect(isGuardedUrl(`${own}#focus-board`, own)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isGuardedUrl('CHROME://Extensions', own)).toBe(true);
  });

  it('leaves ordinary pages and other chrome pages alone', () => {
    expect(isGuardedUrl('https://example.com', own)).toBe(false);
    expect(isGuardedUrl('chrome://newtab/', own)).toBe(false);
    expect(isGuardedUrl('chrome-extension://abc/src/popup/index.html', own)).toBe(false);
  });
});
