import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Baloo_Bhaijaan_2, Cairo } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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
}: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${baloo.variable} ${cairo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <NextIntlClientProvider>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
