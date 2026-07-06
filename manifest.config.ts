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
  permissions: [
    'storage',
    'tabs',
    'alarms',
    'cookies',
    'webRequest',
    'webNavigation',
    'tabCapture',
    'scripting',
  ],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: allHostPatterns(),
      js: ['src/features/news-feed-eradicator/content.ts'],
      run_at: 'document_start',
    },
    {
      matches: [
        'https://www.google.com/*',
        'https://www.google.co.uk/*',
        'https://www.google.ie/*',
        'https://www.google.de/*',
        'https://www.google.fr/*',
        'https://www.google.es/*',
        'https://www.google.it/*',
        'https://www.google.nl/*',
        'https://www.google.be/*',
        'https://www.google.pl/*',
        'https://www.google.at/*',
        'https://www.google.ch/*',
        'https://www.google.pt/*',
        'https://www.google.se/*',
        'https://www.google.dk/*',
        'https://www.google.fi/*',
        'https://www.google.no/*',
      ],
      js: ['src/features/google-unhobble/google-unhobble.content.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/features/tab-cleaner/content-unsaved.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/features/now-playing/now-playing.content.ts'],
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
