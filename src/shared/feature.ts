export const FEATURE_IDS = [
  'tab-cleaner',
  'cookie-editor',
  'redirect-tracer',
  'video-speed',
  'news-feed-eradicator',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export interface FeatureMeta {
  readonly id: FeatureId;
  readonly label: string;
  readonly description: string;
}

export const FEATURE_META: Readonly<Record<FeatureId, FeatureMeta>> = {
  'tab-cleaner': {
    id: 'tab-cleaner',
    label: 'Tab Cleaner',
    description: 'Auto-close inactive tabs with undo.',
  },
  'cookie-editor': {
    id: 'cookie-editor',
    label: 'Cookie Editor',
    description: 'List, edit, and nuke cookies.',
  },
  'redirect-tracer': {
    id: 'redirect-tracer',
    label: 'Redirect Tracer',
    description: 'See the redirect chain for the current tab.',
  },
  'video-speed': {
    id: 'video-speed',
    label: 'Video Speed Controller',
    description: 'Keyboard shortcuts to control HTML5 video/audio speed.',
  },
  'news-feed-eradicator': {
    id: 'news-feed-eradicator',
    label: 'News Feed Eradicator',
    description: 'Hide news feeds on social media and content sites.',
  },
};

export interface Feature {
  readonly id: FeatureId;
  onInstall(): Promise<void>;
  onEnable(): Promise<void>;
  onDisable(): Promise<void>;
}

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === 'string' && (FEATURE_IDS as readonly string[]).includes(value);
}
