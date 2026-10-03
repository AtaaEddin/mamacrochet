import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Centered card shell for the auth pages (login / register / staff login):
 * Hanadi's face up top, one title, one line of body, then the form. Mobile-
 * first, same card in light and dark.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-md px-4 py-8 sm:py-14 sm:px-6", className)}>
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
        <Image
          src="/brand/hanadi-mark.svg"
          alt=""
          aria-hidden="true"
          width={56}
          height={56}
          className="mx-auto size-14"
        />
        <h1 className="mt-3 text-center font-display text-2xl font-extrabold tracking-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-center text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
