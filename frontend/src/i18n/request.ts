import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isAppLocale, routing } from "./routing";

/**
 * Request-scoped i18n config.
 *
 * Locale resolution order:
 * 1. Explicit `locale` passed to awaitable APIs (e.g. `getTranslations({ locale })`) —
 *    needed in Server Actions, where `next/root-params` is not supported yet.
 * 2. The `[locale]` segment via `next/root-params` (Next.js 16.3+, Server Components).
 * 3. The locale header set by the intl proxy (legacy fallback).
 * 4. Default locale (`en`).
 */
export default getRequestConfig(async ({ locale: explicitLocale }) => {
  let requested = explicitLocale;

  if (requested === undefined) {
    try {
      const { locale } = await import("next/root-params");
      requested = await locale();
    } catch {
      requested = undefined;
    }
  }

  if (requested === undefined) {
    try {
      const header = (await headers()).get("x-next-intl-locale");
      requested = header ?? undefined;
    } catch {
      requested = undefined;
    }
  }

  const locale = requested !== undefined && isAppLocale(requested)
    ? requested
    : routing.defaultLocale;
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages };
});
