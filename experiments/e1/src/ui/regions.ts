// Only local, authored interactive/reading surfaces contribute to the native
// region. The decorative material lives in a separate click-through window.
export const HIT_REGION_ATTR = "data-e1-hit-region";

export function listHitRegionElements(root: ParentNode = document): Array<{ id: string; element: HTMLElement }> {
  const entries: Array<{ id: string; element: HTMLElement }> = [];
  for (const element of root.querySelectorAll<HTMLElement>(`[${HIT_REGION_ATTR}]`)) {
    const id = element.getAttribute(HIT_REGION_ATTR);
    if (!id || !element.isConnected || !element.getClientRects().length) continue;
    // Scroll-clipped menu descendants must not create invisible native regions
    // outside the one visible menu body. Anchor popouts remain separate regions.
    const menuBody = element.closest(".e1-menu__body");
    if (menuBody && menuBody !== element) continue;
    let hidden = false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement && !parent.open) {
        const summary = parent.querySelector(":scope > summary");
        if (!summary?.contains(element)) { hidden = true; break; }
      }
    }
    if (!hidden && !element.hidden) entries.push({ id, element });
  }
  return entries;
}

export function collectInteractiveRegions(root: ParentNode = document): DOMRect[] {
  return listHitRegionElements(root).map(({ element }) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
}
