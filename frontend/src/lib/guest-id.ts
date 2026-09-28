/**
 * Device guest id (plan 05, D14) — a stable random v4 GUID per browser,
 * persisted in localStorage. It identifies an anonymous visitor across
 * visits (guest orders, guest chat threads) and is later bound to an
 * account at confirmation time (`POST /identity/guest-link`), which makes
 * the guest's orders appear in "My orders".
 *
 * Browser-only (localStorage); do not call from server components.
 */
const GUEST_ID_STORAGE_KEY = "mm.guestId";

function isValidV4Guid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Return this device's guest id, creating (and persisting) it on first use.
 * Never throws: private-mode storage failures degrade to a fresh in-memory id.
 */
export function getGuestId(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = window.localStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (stored && isValidV4Guid(stored)) return stored;
  } catch {
    // fall through — create a fresh id below.
  }
  const fresh = crypto.randomUUID();
  try {
    window.localStorage.setItem(GUEST_ID_STORAGE_KEY, fresh);
  } catch {
    // in-memory only (private mode) — fine for a single visit.
  }
  return fresh;
}
