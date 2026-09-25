/**
 * Which surface the interface is running in.
 *
 * Chrome opens it in the side panel; Firefox, which has no side panel API of
 * the same shape, still opens it as a popup. Two behaviours differ, and both
 * come down to one fact: a popup covers the page, a panel sits beside it.
 */

export function inPanel(): boolean {
  return document.documentElement.dataset.view === 'panel';
}

/**
 * Get out of the way of the page — in a popup only.
 *
 * A popup has to close before somebody can drag on the page underneath it or
 * read a tab it just opened. A panel does not cover anything, and closing it
 * would throw away the surface the user just chose to keep open.
 */
export function closeIfPopup(): void {
  if (!inPanel()) window.close();
}
