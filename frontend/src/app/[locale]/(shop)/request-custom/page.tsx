import { serverFetchProducts } from "@/lib/catalog/server";
import { RequestCustomView } from "@/components/orders/request-custom-view";

/**
 * "Request a custom piece" page (plan 05): the guest-capable creation
 * surface for stock-0 / bespoke pieces — spec + optional sample images +
 * guest contact step. An existing work can be referenced as a starting
 * point ("like this one, but…"); without a reference it's a pure
 * description.
 *
 * Thin server wrapper: it preloads the listed catalog (real products when
 * the API is up, otherwise an empty list → the picker degrades gracefully)
 * and hands off to the client view.
 */
export default async function RequestCustomPage() {
  const products = (await serverFetchProducts(48))?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      <RequestCustomView products={products} />
    </div>
  );
}
