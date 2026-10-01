/**
 * Chat return-URL (plan: chat-fab-and-exit-nav, owner 2026-10-01).
 *
 * Remembering where the visitor came from so the /chat exit bar's Back
 * button can take them back to the *previous page* — not just Home.
 * `history.back()` is unreliable (typed URLs, restored tabs, cold start),
 * and the FAB / header CTA are the only in-app entries into /chat, so
 * recording the URL at click time is deterministic.
 *
 * Browser-only (sessionStorage, per tab — a fresh tab starts "without" a
 * previous page, and Back falls back to Home). Never throws.
 */
const RETURN_TO_KEY = "hc.chatReturnTo";

/** Store the current URL so /chat can send the visitor back here. */
export function rememberChatReturnTo(): void {
  if (typeof window === "undefined") return;
  try {
    // Never store the chat page itself (the FAB is hidden there anyway, but
    // the header CTA is visible on /chat — its click must be a no-op).
    // Chat routes are locale-prefixed: /en/chat, /ar/chat, ...
    if (/(^|\/)(chat)(\/|$)/.test(window.location.pathname)) return;
    const url = window.location.pathname + window.location.search;
    window.sessionStorage.setItem(RETURN_TO_KEY, url);
  } catch {
    // private mode — degrade: Back falls back to Home.
  }
}

/**
 * Read and clear the stored return URL. Returns null when there is none
 * (first visit / deep link) — callers fall back to Home.
 */
export function consumeChatReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = window.sessionStorage.getItem(RETURN_TO_KEY);
    window.sessionStorage.removeItem(RETURN_TO_KEY);
    return url !== null && url.startsWith("/") ? url : null;
  } catch {
    return null;
  }
}
