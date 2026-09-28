import { StaffOrdersView } from "@/components/orders/staff-orders-view";

/**
 * Staff orders workspace (plan 05, D22): assigned orders with contact
 * search + status filter; the stage drives the lifecycle — start work,
 * progress notes, WIP photos, set-ready with final price, cancel with
 * reason. Payment/delivery recording is plan 07.
 */
export default function StaffOrdersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <StaffOrdersView />
    </div>
  );
}
