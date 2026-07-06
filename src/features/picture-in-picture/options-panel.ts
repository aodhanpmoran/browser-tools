export function renderPictureInPictureOptionsPanel(): HTMLElement {
  const root = document.createElement('section');
  root.className = 'pip-panel-options';
  const note = document.createElement('p');
  note.className = 'muted-note';
  note.textContent =
    'Click the "Pop out video" button in the popup to push the largest video on the current tab into a floating Picture-in-Picture window. Click again to return it.';
  root.append(note);
  return root;
}
