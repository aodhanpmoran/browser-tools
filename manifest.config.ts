import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };
import { allHostPatterns } from './src/features/news-feed-eradicator/rules';

export default defineManifest({
  manifest_version: 3,
  name: 'Browser Tools',
  version: pkg.version,
  description: pkg.description,
  minimum_chrome_version: '111',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Browser Tools',
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['storage', 'tabs', 'alarms', 'cookies', 'webRequest', 'webNavigation'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: allHostPatterns(),
      js: ['src/features/news-feed-eradicator/content.ts'],
      run_at: 'document_start',
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/features/tab-cleaner/content-unsaved.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['http://*/*', 'https://*/*', 'file:///*'],
      all_frames: true,
      match_about_blank: true,
      exclude_matches: [
        'https://hangouts.google.com/*',
        'https://meet.google.com/*',
      ],
      js: ['src/features/video-speed/upstream/src/entries/content-bridge.js'],
      run_at: 'document_start',
      world: 'ISOLATED',
    },
    {
      matches: ['http://*/*', 'https://*/*', 'file:///*'],
      all_frames: true,
      match_about_blank: true,
      exclude_matches: [
        'https://hangouts.google.com/*',
        'https://meet.google.com/*',
      ],
      css: ['src/features/video-speed/upstream/src/styles/inject.css'],
      js: ['src/features/video-speed/upstream/src/entries/inject-entry.js'],
      run_at: 'document_idle',
      world: 'MAIN',
    },
  ],
});
