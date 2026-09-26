import createIntlProxy from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Locale negotiation proxy (Next.js 16 renamed `middleware` to `proxy`).
 *
 * Priority: URL prefix → cookie (`mamacrochet-locale`) → `Accept-Language` → `en`.
 */
export default createIntlProxy(routing);

export const config = {
  // Run on all page paths except API routes, Next internals and static files.
  matcher: ["/((?!api|_next|_vercel|favicon.ico|.*\\..*).*)"],
};
