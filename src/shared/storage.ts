import { FEATURE_IDS, type FeatureId } from './feature';

export interface TabCleanerSettings {
  thresholdMinutes: number;
  allowlist: string[];
  excludePinned: boolean;
  excludeAudible: boolean;
  excludeDirtyInput: boolean;
}

export interface RedirectTracerSettings {
  // Reserved for future options. Enabled flag lives on `Settings.enabled`.
}

export interface NewsFeedEradicatorSettings {
  sitesEnabled: Record<string, boolean>;
  showReplacement: boolean;
}

export interface GoogleUnhobbleSettings {
  restoreMapsLink: boolean;
  restoreViewImage: boolean;
}

export interface NowPlayingSettings {
  historyCap: number;
  autoSave: boolean;
  acrHost: string;
  acrKey: string;
  acrSecret: string;
  audioCaptureSeconds: number;
}

export interface FocusBoardSettings {
  /** Default length of a focus run in minutes. 0 means an open-ended stopwatch. */
  sessionMinutes: number;
  /** Durations offered in the popup's picker. 0 is the stopwatch option. */
  sessionPresets: number[];
  /** Clear completed tasks at the start of each local day. */
  autoRollover: boolean;
  /** Mirror the running timer on the toolbar badge. */
  showBadge: boolean;
  /** Block `blocklist` sites while a focus session is running. */
  blockDuringFocus: boolean;
  /** Hostnames to block. Normalised at use time, so free-form entry is fine. */
  blocklist: string[];
  /** Also divert chrome://extensions, chrome://settings and this options page. */
  guardSettingsPages: boolean;
  /** Read daily suggestions written by the desktop agent. */
  suggestionsEnabled: boolean;
  /** Path to the agent-written JSON. `~/` and bare relative paths are expanded. */
  suggestionsPath: string;
}

export interface Settings {
  enabled: Record<FeatureId, boolean>;
  tabCleaner: TabCleanerSettings;
  redirectTracer: RedirectTracerSettings;
  newsFeedEradicator: NewsFeedEradicatorSettings;
  googleUnhobble: GoogleUnhobbleSettings;
  nowPlaying: NowPlayingSettings;
  focusBoard: FocusBoardSettings;
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
  redirectTracer: {},
  newsFeedEradicator: {
    sitesEnabled: {
      twitter: true,
      youtube: true,
      linkedin: true,
      facebook: true,
      reddit: true,
    },
    showReplacement: true,
  },
  googleUnhobble: {
    restoreMapsLink: true,
    restoreViewImage: true,
  },
  nowPlaying: {
    historyCap: 200,
    autoSave: false,
    acrHost: 'identify-eu-west-1.acrcloud.com',
    acrKey: '',
    acrSecret: '',
    audioCaptureSeconds: 10,
  },
  focusBoard: {
    sessionMinutes: 25,
    sessionPresets: [15, 25, 50, 90, 0],
    autoRollover: true,
    showBadge: true,
    blockDuringFocus: true,
    blocklist: [
      'youtube.com',
      'x.com',
      'twitter.com',
      'reddit.com',
      'instagram.com',
      'facebook.com',
      'tiktok.com',
      'news.ycombinator.com',
      'linkedin.com',
    ],
    guardSettingsPages: true,
    suggestionsEnabled: true,
    // Absolute path, resolved once by the options panel's Detect button — a
    // popup has no filesystem API to expand `~` with.
    suggestionsPath: '',
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
