import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Baloo_Bhaijaan_2, Cairo } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ChatLauncher } from "@/components/chat-launcher";
import { Toaster } from "@/components/ui/toast";
import { ThemeProvider } from "@/components/theme-provider";
import { isAppLocale, routing } from "@/i18n/routing";
import "../globals.css";

const baloo = Baloo_Bhaijaan_2({
  subsets: ["arabic", "latin"],
  weight: ["500", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-cairo",
  display: "swap",
});

export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    // `||` (not `??`): the production Docker build passes an EMPTY string
    // when no public URL is configured, and new URL("") throws (plan 10).
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"),
    title: {
      default: t("title"),
      template: `%s · ${t("name")}`,
    },
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      // next-themes' inline script mutates documentElement (color-scheme +
      // theme class) before hydration; the README mandates this flag on
      // <html> (one level deep, so child mismatches still surface).
      suppressHydrationWarning
      className={`${baloo.variable} ${cairo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <NextIntlClientProvider>
            {children}
            <ChatLauncher />
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
