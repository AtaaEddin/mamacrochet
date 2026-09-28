import { HiringView } from "@/components/admin/hiring-view";

/**
 * Admin hiring queue (plan 09). Client-gated to the `admin` role: anything
 * else gets a 403 card, not a redirect (same pattern as /admin/users — the
 * server still enforces everything).
 */
export default function AdminHiringPage() {
  return <HiringView />;
}
