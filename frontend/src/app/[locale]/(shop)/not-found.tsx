import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LostScene } from "@/components/illustrations/lost-scene";

export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <div className="mx-auto flex min-h-[60svh] w-full max-w-2xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <LostScene className="h-auto w-64 max-w-full animate-fade-in sm:w-72" />
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
        {t("body")}
      </p>
      <Link href="/" className="mt-7">
        <Button size="lg" className="rounded-full">
          {t("cta")}
        </Button>
      </Link>
    </div>
  );
}
