"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { isOrderStatus } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

/**
 * Localized order status badge (plan 05). Terminal/side states get a
 * distinct tone so a cancelled order never reads as "on its way".
 */
export function OrderStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const t = useTranslations("Orders.status");
  const isCancelled = status === "cancelled";
  const isClosed = status === "closed";
  const tone = isCancelled
    ? "bg-destructive/10 text-destructive border-destructive/30"
    : isClosed
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
      : status === "ready_for_payment"
        ? "bg-brand-gold/15 text-brand-gold border-brand-gold/30"
        : "bg-accent text-accent-foreground border-transparent";

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 font-bold tracking-wide",
        tone,
        className,
      )}
    >
      {isOrderStatus(status) ? t(status) : status}
    </Badge>
  );
}
