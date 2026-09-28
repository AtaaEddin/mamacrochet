"use client";

import { useTranslations } from "next-intl";
import { BadgeCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Post-creation confirmation (plan 05): "the request is received — a team
 * member will reach you in chat." Sets the expectation that staff contact
 * happens in chat and confirmation (payment) happens at
 * ready_for_payment (plans 06/07).
 */
export function OrderSuccessDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations("Orders.create");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <BadgeCheck className="size-6" aria-hidden="true" />
          </span>
          <DialogTitle className="pt-2">{t("successTitle")}</DialogTitle>
          <DialogDescription className="px-6 text-center text-sm leading-relaxed">
            {t("successBody")}
          </DialogDescription>
        </DialogHeader>
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Star className="mt-0.5 size-3.5 shrink-0 text-brand-gold" aria-hidden="true" />
          <span>{t("successHint")}</span>
        </p>
        <Button onClick={onDone} className="mt-1 w-full">
          {t("successDone")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
