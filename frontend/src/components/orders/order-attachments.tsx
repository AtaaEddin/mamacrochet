"use client";

import type { OrderAttachmentDto } from "@/lib/orders/api";
import { orderFileUrl } from "@/lib/orders/api";

/**
 * Order photo strip (plan 05): sample references (customer uploads) + WIP
 * progress photos (staff uploads). The server already scopes the kinds per
 * role — customers get sample|wip of their own order, staff/admin get all.
 * Only the photo kinds render here: receipts / delivery proofs (plan 07)
 * are PDF-or-image files shown through their own cards instead.
 */
export function OrderAttachments({
  attachments,
  label,
}: {
  attachments: OrderAttachmentDto[];
  label: string;
}) {
  const photos = attachments.filter((a) => a.kind === "sample" || a.kind === "wip");
  if (photos.length === 0) return null;

  return (
    <div>
      <p className="font-display text-sm font-bold">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {photos.map((a) => (
          <a
            key={a.id}
            href={orderFileUrl(a.url)}
            target="_blank"
            rel="noreferrer"
            className="group relative block overflow-hidden rounded-2xl border border-border/60 bg-muted/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- API-served files, not next/image */}
            <img
              src={orderFileUrl(a.url)}
              alt={a.originalName}
              loading="lazy"
              className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
            />
            <span className="pointer-events-none absolute inset-0 rounded-2xl ring-0 transition group-hover:ring-2 group-hover:ring-ring/60" />
          </a>
        ))}
      </div>
    </div>
  );
}
