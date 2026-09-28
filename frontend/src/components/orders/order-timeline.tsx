"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Banknote,
  ClipboardCheck,
  MessageSquare,
  PackageCheck,
  ShieldCheck,
  Star,
  Truck,
  UserPlus,
} from "lucide-react";
import type { OrderEventDto } from "@/lib/orders/api";
import { OrderStatusBadge } from "./order-status-badge";

function formatWhen(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

const ICONS = {
  status: ClipboardCheck,
  note: MessageSquare,
  assignment: UserPlus,
  rating: Star,
  auto: ShieldCheck,
  payment: Banknote,
  delivery: Truck,
  confirmation: PackageCheck,
} as const;

/**
 * The order timeline (plan 05) — one event list that IS the customer's
 * status board AND the admin trace. The server already filters
 * admin-only events out of non-admin views, so this renders what it
 * receives: icon + actor + role + time, then the status badge / note.
 */
export function OrderTimeline({ events }: { events: OrderEventDto[] }) {
  const t = useTranslations("Orders");
  const locale = useLocale();

  return (
    <ol className="relative space-y-4 border-s-2 border-border/60 ps-4">
      {events.map((e) => {
        const Icon = ICONS[e.kind as keyof typeof ICONS] ?? MessageSquare;
        return (
          <li key={e.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute -start-[21px] top-0.5 grid size-6 place-items-center rounded-full border border-border bg-card"
            >
              <Icon className="size-3.5 text-muted-foreground" />
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{e.actorName}</span>
              <span>
                {e.actorRole === "system"
                  ? t("actorSystem")
                  : t(`actor.${e.actorRole}`)}
              </span>
              <time dateTime={e.at}>{formatWhen(e.at, locale)}</time>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {e.status && (e.kind === "status" || e.kind === "payment" || e.kind === "delivery") ? (
                <OrderStatusBadge status={e.status} />
              ) : e.kind === "rating" ? (
                <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-gold">
                  <Star className="size-4 fill-brand-gold" aria-hidden="true" />
                  {t("ratedLabel")}
                </span>
              ) : e.kind === "confirmation" ? (
                <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-gold">
                  <PackageCheck className="size-4" aria-hidden="true" />
                  {t("confirmDeliveryDone")}
                </span>
              ) : null}
              {e.note ? (
                <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {e.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
