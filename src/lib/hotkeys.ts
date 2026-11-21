/** False while typing, with a modifier held, or behind an open modal. */
export function isGameKey(e: KeyboardEvent): boolean {
  return !(e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey
    || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'));
}
