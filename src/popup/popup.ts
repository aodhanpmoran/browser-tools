import { FEATURE_IDS, FEATURE_META } from '../shared/feature';
import { getSettings, setFeatureEnabled } from '../shared/storage';

const listEl = document.querySelector<HTMLUListElement>('#feature-list');
const optionsButton = document.querySelector<HTMLButtonElement>('#open-options');

if (!listEl) throw new Error('#feature-list not found');
if (!optionsButton) throw new Error('#open-options not found');

optionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

void render();

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void render();
});

async function render(): Promise<void> {
  const settings = await getSettings();
  listEl!.replaceChildren(
    ...FEATURE_IDS.map((id) => {
      const meta = FEATURE_META[id];
      const enabled = settings.enabled[id];
      return renderRow(id, meta.label, meta.description, enabled);
    }),
  );
}

function renderRow(
  id: string,
  label: string,
  description: string,
  enabled: boolean,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'feature-row';

  const toggle = document.createElement('label');
  toggle.className = 'feature-toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = enabled;
  checkbox.dataset.featureId = id;
  checkbox.addEventListener('change', () => {
    void setFeatureEnabled(id as Parameters<typeof setFeatureEnabled>[0], checkbox.checked);
  });

  const text = document.createElement('span');
  text.className = 'feature-text';
  const strong = document.createElement('strong');
  strong.textContent = label;
  const small = document.createElement('small');
  small.textContent = description;
  text.append(strong, small);

  toggle.append(checkbox, text);
  li.append(toggle);
  return li;
}
