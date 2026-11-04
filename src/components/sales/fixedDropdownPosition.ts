/** Dropdown shell height used for flip/clamp (matches InvoicePartDropdownList h-80). */
export const INVOICE_PART_DROPDOWN_HEIGHT_PX = 320;

export type FixedDropdownPosition = {
  top: number;
  left: number;
  width: number;
  /** True when the menu opens above the input (not enough room below). */
  openUp?: boolean;
};

/**
 * Position for a `position: fixed` portaled menu.
 * Uses viewport coordinates only — do NOT add window.scrollX/Y (that shifts
 * the menu on scrolled pages and causes it to overlap form fields).
 */
export function getFixedDropdownPosition(
  rect: DOMRect,
  opts?: {
    menuHeight?: number;
    gap?: number;
    minWidth?: number;
    maxWidth?: number;
  },
): FixedDropdownPosition {
  const gap = opts?.gap ?? 4;
  const menuHeight = opts?.menuHeight ?? INVOICE_PART_DROPDOWN_HEIGHT_PX;
  const viewportW =
    typeof window !== "undefined" ? window.innerWidth : rect.width;
  const viewportH =
    typeof window !== "undefined" ? window.innerHeight : menuHeight;

  const spaceBelow = viewportH - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const openUp =
    spaceBelow < Math.min(menuHeight, 200) && spaceAbove > spaceBelow;

  let width = Math.max(rect.width, opts?.minWidth ?? 0);
  if (opts?.maxWidth) width = Math.min(width, opts.maxWidth);
  width = Math.min(width, Math.max(200, viewportW - 16));

  let left = rect.left;
  if (left + width > viewportW - 8) {
    left = Math.max(8, viewportW - width - 8);
  }
  if (left < 8) left = 8;

  const top = openUp
    ? Math.max(8, rect.top - gap - Math.min(menuHeight, spaceAbove))
    : Math.min(rect.bottom + gap, Math.max(8, viewportH - 48));

  return { top, left, width, openUp };
}
