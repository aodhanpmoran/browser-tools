import { getSettings, patchSettings } from '../../shared/storage';
import { SITE_RULES } from './rules';

export async function renderNfeOptionsPanel(featureEnabled: boolean): Promise<HTMLElement> {
  const settings = await getSettings();
  const { sitesEnabled, showReplacement } = settings.newsFeedEradicator;

  const root = document.createElement('section');
  root.className = 'nfe-panel';

  const sitesHeader = document.createElement('h3');
  sitesHeader.textContent = 'Sites';
  sitesHeader.className = 'subheader';

  const sitesList = document.createElement('div');
  sitesList.className = 'site-list';

  for (const rule of SITE_RULES) {
    const row = document.createElement('label');
    row.className = 'site-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = sitesEnabled[rule.id] ?? true;
    cb.disabled = !featureEnabled;
    cb.addEventListener('change', () => {
      void patchSettings({
        newsFeedEradicator: { sitesEnabled: { [rule.id]: cb.checked } },
      });
    });
    const name = document.createElement('span');
    name.textContent = rule.label;
    row.append(cb, name);
    sitesList.append(row);
  }

  const bannerToggle = document.createElement('label');
  bannerToggle.className = 'secondary-toggle';
  const bannerCb = document.createElement('input');
  bannerCb.type = 'checkbox';
  bannerCb.checked = showReplacement;
  bannerCb.disabled = !featureEnabled;
  bannerCb.addEventListener('change', () => {
    void patchSettings({ newsFeedEradicator: { showReplacement: bannerCb.checked } });
  });
  const bannerText = document.createElement('span');
  bannerText.textContent = 'Show replacement banner';
  bannerToggle.append(bannerCb, bannerText);

  root.append(sitesHeader, sitesList, bannerToggle);
  return root;
}
