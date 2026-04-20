import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };
import { allHostPatterns } from './src/features/news-feed-eradicator/rules';

export default defineManifest({
  manifest_version: 3,
  name: 'Browser Tools',
  version: pkg.version,
  description: pkg.description,
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Browser Tools',
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['storage'],
  host_permissions: [],
  content_scripts: [
    {
      matches: allHostPatterns(),
      js: ['src/features/news-feed-eradicator/content.ts'],
      run_at: 'document_start',
    },
  ],
});
