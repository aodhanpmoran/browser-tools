import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRules, rulesEqual } from '../../src/features/focus-board/blocker';
import {
  clearSuggestionsCache,
  loadSuggestionsCached,
} from '../../src/features/focus-board/suggestions';

const PAGE = 'chrome-extension://abc/blocked.html';

describe('rulesEqual', () => {
  it('matches identical rule sets regardless of order', () => {
    const a = buildRules(['a.com', 'b.com'], PAGE);
    expect(rulesEqual(a, [...buildRules(['a.com', 'b.com'], PAGE)].reverse())).toBe(true);
  });
  it('differs on site, count or block page url', () => {
    const a = buildRules(['a.com'], PAGE);
    expect(rulesEqual(a, buildRules(['b.com'], PAGE))).toBe(false);
    expect(rulesEqual(a, buildRules(['a.com', 'b.com'], PAGE))).toBe(false);
    expect(rulesEqual(a, buildRules(['a.com'], 'chrome-extension://zzz/blocked.html'))).toBe(false);
    expect(rulesEqual([], [])).toBe(true);
  });
});

describe('loadSuggestionsCached', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSuggestionsCache();
  });
  const stubFetch = () => {
    const f = vi.fn(async () => ({ ok: true, text: async () => '{"suggestions":[]}' }));
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('fetches once within 30s, again after', async () => {
    const f = stubFetch();
    await loadSuggestionsCached('file:///x.json', 1000);
    await loadSuggestionsCached('file:///x.json', 20_000);
    expect(f).toHaveBeenCalledTimes(1);
    await loadSuggestionsCached('file:///x.json', 32_000);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('keys by url', async () => {
    const f = stubFetch();
    await loadSuggestionsCached('file:///x.json', 1000);
    await loadSuggestionsCached('file:///y.json', 1000);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('store mutate with navigator.locks', () => {
  it('runs inside the bt-focusBoard lock', async () => {
    vi.resetModules();
    let data: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (k: string) => ({ [k]: data[k] }),
          set: async (o: Record<string, unknown>) => void Object.assign(data, o),
        },
      },
    });
    const request = vi.fn(async (_n: string, cb: () => Promise<unknown>) => cb());
    vi.stubGlobal('navigator', { locks: { request } });
    const store = await import('../../src/features/focus-board/store');
    await store.addTask('hello', 'today');
    expect(request).toHaveBeenCalledWith('bt-focusBoard', expect.any(Function));
    expect((data.focusBoard as { tasks: unknown[] }).tasks).toHaveLength(1);
    vi.unstubAllGlobals();
  });
  it('falls back to the in-page queue without locks', async () => {
    vi.resetModules();
    const data: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (k: string) => ({ [k]: data[k] }),
          set: async (o: Record<string, unknown>) => void Object.assign(data, o),
        },
      },
    });
    vi.stubGlobal('navigator', {});
    const store = await import('../../src/features/focus-board/store');
    await Promise.all([store.addTask('a', 'backlog'), store.addTask('b', 'backlog')]);
    expect((data.focusBoard as { tasks: unknown[] }).tasks).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});
