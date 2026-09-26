"use client";

import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const OPEN_CHAT_EVENT = "mamacrochet:open-chat";

export function openChat() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
}

/**
 * CTA that opens the floating chat widget (the guest-first primary action, D14).
 */
export function OpenChatButton({
  label,
  className,
  size = "lg",
}: {
  label?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const t = useTranslations();
  return (
    <Button
      size={size}
      onClick={openChat}
      className={cn("h-11 rounded-full shadow-sm", className)}
    >
      <MessageCircle data-icon="inline-start" aria-hidden="true" />
      {label ?? t("Nav.hello")}
    </Button>
  );
}
