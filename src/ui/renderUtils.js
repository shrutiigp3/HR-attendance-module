/**
 * Shared view rendering helpers.
 */

/**
 * Runs a view re-render without kicking the user out of the field they're typing in.
 * Views rebuild their DOM via innerHTML, so focus and caret are moved to the new element
 * with the same id (e.g. a search box) once the render is done.
 */
export function renderPreservingFocus(render) {
  const active = document.activeElement;
  const id = active?.id;
  const caret = typeof active?.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;

  render();

  const el = id ? document.getElementById(id) : null;
  if (!el || el === active) return;
  el.focus({ preventScroll: true });
  if (caret && typeof el.selectionStart === 'number') el.setSelectionRange(caret[0], caret[1]);
}
