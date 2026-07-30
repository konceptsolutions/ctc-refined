/**
 * Detects a newly deployed frontend build and reloads so tabs don't keep a stale UI.
 * Hashed Vite assets change on each deploy; index.html must be re-fetched to pick them up.
 */

function getMainAssetFromHtml(html: string): string | null {
  const match = html.match(/\/assets\/main-[A-Za-z0-9_-]+\.(?:js|css)/);
  return match?.[0] ?? null;
}

function getCurrentMainAsset(): string | null {
  const script = document.querySelector(
    'script[type="module"][src*="/assets/main-"]',
  ) as HTMLScriptElement | null;
  return script?.getAttribute("src") ?? null;
}

let checking = false;
let lastCheckAt = 0;

export async function checkForNewDeploy(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  // Skip in Vite/dev where assets are not hashed under /assets/main-*
  if (!getCurrentMainAsset()) return;

  const now = Date.now();
  if (!force && (checking || now - lastCheckAt < 5_000)) return;
  checking = true;
  lastCheckAt = now;

  try {
    const res = await fetch(`/index.html?_=${now}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return;

    const html = await res.text();
    const latest = getMainAssetFromHtml(html);
    const current = getCurrentMainAsset();
    if (latest && current && latest !== current) {
      window.location.reload();
    }
  } catch {
    // Network blips should not interrupt the session.
  } finally {
    checking = false;
  }
}

export function initDeployRefresh(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("pageshow", (event) => {
    // Restored from bfcache / duplicated tab snapshot — force a fresh shell.
    if (event.persisted) {
      window.location.reload();
      return;
    }
    void checkForNewDeploy(true);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkForNewDeploy();
    }
  });

  window.addEventListener("focus", () => {
    void checkForNewDeploy();
  });
}
