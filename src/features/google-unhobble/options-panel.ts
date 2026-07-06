import { getSettings, patchSettings } from '../../shared/storage';

export async function renderGoogleUnhobbleOptionsPanel(
  featureEnabled: boolean,
): Promise<HTMLElement> {
  const settings = await getSettings();
  const { restoreMapsLink, restoreViewImage } = settings.googleUnhobble;

  const root = document.createElement('section');
  root.className = 'gu-panel';

  const subhead = document.createElement('h3');
  subhead.className = 'subheader';
  subhead.textContent = 'Restorations';

  const list = document.createElement('div');
  list.className = 'site-list';

  const rows: Array<[keyof typeof settings.googleUnhobble, string, string]> = [
    ['restoreMapsLink', 'Maps link on Google Search', 'Injects a Maps tab next to All / Images / Videos. Uses your current query.'],
    ['restoreViewImage', 'View image on Google Images', 'Adds a "View image" button to the image preview panel.'],
  ];
  const values = { restoreMapsLink, restoreViewImage };

  for (const [key, label, help] of rows) {
    const row = document.createElement('label');
    row.className = 'site-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = values[key];
    cb.disabled = !featureEnabled;
    cb.addEventListener('change', () => {
      void patchSettings({ googleUnhobble: { [key]: cb.checked } });
    });
    const text = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = label;
    const small = document.createElement('small');
    small.className = 'muted';
    small.textContent = help;
    small.style.display = 'block';
    text.append(strong, small);
    row.append(cb, text);
    list.append(row);
  }

  const note = document.createElement('p');
  note.className = 'muted-note';
  note.textContent =
    'Google removes these affordances for EU users under DMA compliance. Works best-effort — Google changes markup frequently.';

  root.append(subhead, list, note);
  return root;
}
