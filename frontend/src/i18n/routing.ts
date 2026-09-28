import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar", "tr"],
  defaultLocale: "en",
  localeCookie: {
    name: "hanadicrochet-locale",
  },
});

export type AppLocale = (typeof routing.locales)[number];

export function isAppLocale(value: string | undefined): value is AppLocale {
  if (value === undefined) return false;
  return (routing.locales as readonly string[]).includes(value);
}
