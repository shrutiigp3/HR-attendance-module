/**
 * Shared view rendering helpers.
 */

/**
 * Runs a view re-render without kicking the user out of the field they're typing in.
 * Views rebuild their DOM via innerHTML, so focus and caret are moved to the new element
 * with the same id (e.g. a search box) once the render is done. Scrolled tables (matched by
 * the table's id) are put back at the same scroll position, so the user stays on the row
 * and column they were working on.
 */
export function renderPreservingFocus(render) {
  const active = document.activeElement;
  const id = active?.id;
  const caret = typeof active?.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const scrolled = [...document.querySelectorAll('.table-responsive')]
    .map(box => ({ tableId: box.querySelector('table[id]')?.id, top: box.scrollTop, left: box.scrollLeft }))
    .filter(s => s.tableId && (s.top || s.left));

  render();

  for (const { tableId, top, left } of scrolled) {
    const box = document.getElementById(tableId)?.closest('.table-responsive');
    if (box) {
      box.scrollTop = top;
      box.scrollLeft = left;
    }
  }

  const el = id ? document.getElementById(id) : null;
  if (!el || el === active) return;
  el.focus({ preventScroll: true });
  if (caret && typeof el.selectionStart === 'number') el.setSelectionRange(caret[0], caret[1]);
}
