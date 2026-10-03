/**
 * OData `$filter` string helpers shared by the list queries (orders, staff
 * products, catalog). The list endpoints take `$filter` as a plain string
 * (the API parses it into its query spec) — string literals inside it must
 * have single quotes doubled.
 */
export function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}
