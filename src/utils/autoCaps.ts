type AutoCapsOptions = {
  /**
   * Set false to disable globally.
   */
  enabled?: boolean;
};

function isExcludedInputType(type: string) {
  const t = type.trim().toLowerCase();
  return [
    "password",
    "email",
    "url",
    "search",
    "number",
    "tel",
    "date",
    "datetime-local",
    "time",
    "week",
    "month",
    "color",
    "range",
    "file",
  ].includes(t);
}

function shouldAutoCaps(
  el: HTMLElement
): el is HTMLInputElement | HTMLTextAreaElement {
  // Opt-out anywhere in the subtree (helps with custom components)
  if (el.closest('[data-preserve-case="true"]')) return false;

  if (el instanceof HTMLInputElement) {
    const typeAttr = el.getAttribute("type") ?? "text";
    if (isExcludedInputType(typeAttr)) return false;
    if (el.readOnly || el.disabled) return false;
    return true;
  }

  if (el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return false;
    return true;
  }

  return false;
}

/**
 * Auto-uppercase text input across the app so users don't need Caps Lock.
 *
 * - Applies to: text inputs + textareas
 * - Excludes: password/email/url/search/number/etc
 * - Opt-out: add `data-preserve-case="true"` on the input/textarea or any parent
 */
export function initAutoCapsLock(options: AutoCapsOptions = {}) {
  if (options.enabled === false) return () => {};

  const handler = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!shouldAutoCaps(target)) return;

    // Don't interfere with IME/composition typing.
    if ((event as InputEvent).isComposing) return;

    const before = target.value;
    const upper = before.toUpperCase();
    if (before === upper) return;

    // Preserve caret/selection: uppercase doesn't change string length.
    const selectionStart =
      "selectionStart" in target ? (target as any).selectionStart : null;
    const selectionEnd =
      "selectionEnd" in target ? (target as any).selectionEnd : null;

    target.value = upper;

    try {
      if (
        typeof selectionStart === "number" &&
        typeof selectionEnd === "number" &&
        "setSelectionRange" in target
      ) {
        (target as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(
          selectionStart,
          selectionEnd
        );
      }
    } catch {
      // ignore
    }
  };

  // Capture phase so React sees the already-uppercased value.
  document.addEventListener("input", handler, true);
  document.addEventListener("change", handler, true);

  return () => {
    document.removeEventListener("input", handler, true);
    document.removeEventListener("change", handler, true);
  };
}

