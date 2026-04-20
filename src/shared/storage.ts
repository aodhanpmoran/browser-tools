import { FEATURE_IDS, type FeatureId } from './feature';

export interface TabCleanerSettings {
  thresholdMinutes: number;
  allowlist: string[];
  excludePinned: boolean;
  excludeAudible: boolean;
  excludeDirtyInput: boolean;
}

export interface RedirectTracerSettings {
  bufferSize: number;
}

export interface Settings {
  enabled: Record<FeatureId, boolean>;
  tabCleaner: TabCleanerSettings;
  redirectTracer: RedirectTracerSettings;
}

const STORAGE_KEY = 'settings';

const DEFAULT_ENABLED: Record<FeatureId, boolean> = Object.fromEntries(
  FEATURE_IDS.map((id) => [id, true]),
) as Record<FeatureId, boolean>;

export const DEFAULT_SETTINGS: Settings = {
  enabled: DEFAULT_ENABLED,
  tabCleaner: {
    thresholdMinutes: 60,
    allowlist: [],
    excludePinned: true,
    excludeAudible: true,
    excludeDirtyInput: true,
  },
  redirectTracer: {
    bufferSize: 20,
  },
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<Settings> | undefined;
  return mergeWithDefaults(stored);
}

export async function setSettings(next: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

export async function patchSettings(patch: DeepPartial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = deepMerge(current, patch);
  await setSettings(next);
  return next;
}

export async function setFeatureEnabled(id: FeatureId, enabled: boolean): Promise<Settings> {
  return patchSettings({ enabled: { [id]: enabled } });
}

export function onSettingsChanged(listener: (next: Settings, prev: Settings) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: chrome.storage.AreaName,
  ) => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    const next = mergeWithDefaults(change.newValue as Partial<Settings> | undefined);
    const prev = mergeWithDefaults(change.oldValue as Partial<Settings> | undefined);
    listener(next, prev);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

function mergeWithDefaults(stored: Partial<Settings> | undefined): Settings {
  if (!stored) return structuredClone(DEFAULT_SETTINGS);
  return deepMerge(DEFAULT_SETTINGS, stored);
}

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(override)) {
    const baseVal = (base as Record<string, unknown>)[key];
    const overrideVal = (override as Record<string, unknown>)[key];
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(baseVal, overrideVal as DeepPartial<typeof baseVal>);
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
