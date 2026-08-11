export function renderImagePickerOptionsPanel(): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ip-panel-options';

  const note = document.createElement('p');
  note.className = 'muted-note';
  note.textContent =
    'Open the popup and click "Scan this tab", or paste a link, to see every image on a page in a grid. Tick the ones you want and download them to Downloads/browser-tools/<site>/. Pasted links are fetched as static HTML, so images added by JavaScript may not appear — visit the page and scan the tab for those.';

  root.append(note);
  return root;
}
