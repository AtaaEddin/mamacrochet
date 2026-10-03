import { StaffProductsView } from "@/components/staff/staff-products-view";

/**
 * Staff product management (plan 04). Client-gated to the team (employee or
 * admin); anything else gets a "team only" card, not a redirect (the server
 * still enforces every call).
 */
export default function StaffProductsPage() {
  return <StaffProductsView />;
}
