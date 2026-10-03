import { AdminOrdersView } from "@/components/orders/admin-orders-view";

/**
 * Admin orders (plan 05): live metrics (open counts + per-employee
 * throughput), filterable paginated table, full trace detail with
 * assignment + override transition (mandatory reason note).
 */
export default function AdminOrdersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <AdminOrdersView />
    </div>
  );
}
