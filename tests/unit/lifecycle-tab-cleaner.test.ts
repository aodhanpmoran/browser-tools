import { beforeEach, describe, expect, it, vi } from 'vitest';

const session: Record<string, unknown> = {};
let tabs: Array<{ id: number }> = [];
const queryMock = vi.fn(async () => tabs);

beforeEach(() => {
  for (const k of Object.keys(session)) delete session[k];
  tabs = [];
  queryMock.mockClear();
  vi.resetModules();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      session: {
        // Yield so that unserialised read-modify-writes would interleave.
        get: vi.fn(async (k: string) => {
          const snap = structuredClone({ [k]: session[k] });
          await new Promise((r) => setTimeout(r, 1));
          return snap;
        }),
        set: vi.fn(async (o: Record<string, unknown>) => {
          Object.assign(session, structuredClone(o));
        }),
        remove: vi.fn(async () => {}),
      },
    },
    tabs: { query: queryMock },
  };
});

describe('tab-cleaner activity', () => {
  it('keeps all ids across 50 concurrent touchTab calls', async () => {
    const { touchTab, getActivity } = await import('../../src/features/tab-cleaner/activity');
    await Promise.all(Array.from({ length: 50 }, (_, i) => touchTab(i)));
    expect(Object.keys(await getActivity())).toHaveLength(50);
  });

  it('seedExistingTabs does not overwrite existing timestamps', async () => {
    const { seedExistingTabs, getActivity } = await import('../../src/features/tab-cleaner/activity');
    session.tabActivity = { 1: { lastActiveAt: 5, hasDirtyInput: false } };
    tabs = [{ id: 1 }, { id: 2 }];
    await seedExistingTabs();
    const a = await getActivity();
    expect(a[1]?.lastActiveAt).toBe(5);
    expect(a[2]).toBeDefined();
  });

  it('onEnable keeps timestamps; onFreshEnable resets them', async () => {
    const { tabCleanerFeature } = await import('../../src/features/tab-cleaner');
    (chrome as unknown as { alarms: unknown }).alarms = {
      get: vi.fn(async () => ({})),
      create: vi.fn(),
    };
    session.tabActivity = { 1: { lastActiveAt: 5, hasDirtyInput: false } };
    tabs = [{ id: 1 }];
    await tabCleanerFeature.onEnable();
    expect((session.tabActivity as Record<number, { lastActiveAt: number }>)[1]?.lastActiveAt).toBe(5);
    await tabCleanerFeature.onFreshEnable!();
    expect((session.tabActivity as Record<number, { lastActiveAt: number }>)[1]?.lastActiveAt).toBeGreaterThan(5);
  });

  it('runSweep skips tabs.query when nothing is old enough', async () => {
    const { runSweep } = await import('../../src/features/tab-cleaner/cleaner');
    session.tabActivity = { 1: { lastActiveAt: Date.now(), hasDirtyInput: false } };
    await runSweep();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('getSettingsCached', () => {
  it('reads storage once and refetches after a settings change', async () => {
    const { getSettingsCached } = await import('../../src/shared/storage');
    const local = (chrome as unknown as { storage: { local: { get: ReturnType<typeof vi.fn> }; onChanged: { addListener: ReturnType<typeof vi.fn> } } }).storage;
    await getSettingsCached();
    await getSettingsCached();
    expect(local.local.get).toHaveBeenCalledTimes(1);
    const listener = local.onChanged.addListener.mock.calls[0]![0];
    listener({ settings: {} }, 'local');
    await getSettingsCached();
    expect(local.local.get).toHaveBeenCalledTimes(2);
  });
});
