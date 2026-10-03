import { UsersView } from "@/components/admin/users-view";

/**
 * Admin user management (plan 03). Client-gated to the `admin` role:
 * anything else gets a 403 card, not a redirect (so the link is shareable
 * safely — the server still enforces everything).
 */
export default function AdminUsersPage() {
  return <UsersView />;
}
