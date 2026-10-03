import { MyOrdersView } from "@/components/orders/my-orders-view";

/**
 * Customer "My orders" (plan 05, D22): the status board — step strip,
 * timeline, photos, contact block — plus cancel (open/in_progress) and
 * rating (closed). Guests are shown the sign-in card; the device guest id
 * is linked on load so this device's guest orders join the list.
 */
export default function OrdersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <MyOrdersView />
    </div>
  );
}
