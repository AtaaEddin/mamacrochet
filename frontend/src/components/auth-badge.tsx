"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Scissors, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api, avatarSrc } from "@/lib/api/client";
import type { User } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Header sign-in state (plan 03):
 * - guest → "Sign in" pill (register lives on the login page)
 * - customer → avatar + name → /account
 * - admin → plus the "Team desk" icon → /admin/users
 *
 * Cookie auth: the browser sends mm.auth automatically; 401/gone → guest.
 */
export function AuthBadge() {
  const t = useTranslations("Auth");
  const [me, setMe] = useState<User | null>(null);
  const [known, setKnown] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .GET("/identity/me")
      .then((res) => {
        if (!alive) return;
        setMe(res.data ?? null);
      })
      .catch(() => {
        // Offline / API down: behave like a guest, the pages re-check.
      })
      .finally(() => {
        if (alive) setKnown(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!known) {
    return (
      <div
        aria-hidden="true"
        className="h-11 w-28 animate-pulse rounded-full bg-muted/70"
      />
    );
  }

  if (!me) {
    return (
      <Link
        href="/login"
        className="inline-flex h-11 items-center rounded-full border border-border/70 bg-card px-4 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("signIn")}
      </Link>
    );
  }

  const isAdmin = me.roles.includes("admin");
  const isStaff =
    me.roles.includes("employee") || me.roles.includes("admin");
  const src = avatarSrc(me.avatarUrl);
  const initial = me.displayName.slice(0, 1).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      {isStaff ? (
        <Link
          href="/staff/products"
          aria-label={t("staffProducts")}
          title={t("staffProducts")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Scissors className="size-5" aria-hidden="true" />
        </Link>
      ) : null}
      {isAdmin ? (
        <Link
          href="/admin/users"
          aria-label={t("teamDesk")}
          title={t("teamDesk")}
          className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:inline-flex"
        >
          <Users className="size-5" aria-hidden="true" />
        </Link>
      ) : null}
      <Link
        href="/account"
        aria-label={t("myAccount")}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-card py-1 ps-1 pe-1 shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <Avatar className="size-9 rounded-full">
          {src ? (
            <AvatarImage src={src} alt="" className="rounded-full object-cover" />
          ) : null}
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-28 truncate text-sm font-bold md:block">
          {me.displayName}
        </span>
      </Link>
    </div>
  );
}
