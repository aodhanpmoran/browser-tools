export function renderRedirectTracerOptionsPanel(): HTMLElement {
  const root = document.createElement('section');
  root.className = 'rt-panel';

  const note = document.createElement('p');
  note.className = 'muted-note';
  note.textContent =
    'Captures main-frame redirects for the current page. Resets every time the tab navigates. Stored in chrome.storage.session — cleared on browser restart.';

  root.append(note);
  return root;
}
