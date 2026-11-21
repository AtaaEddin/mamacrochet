namespace Hanadicrochet.Api.Models;

/// <summary>
/// GET /health response — the contract used by the frontend status pill,
/// the generated TS client (pnpm gen:api) and deploy health probes.
/// (Named ApiHealth to avoid clashing with HealthChecks.HealthReport.)
/// <para>
/// Images: "ready" when the image pipeline has encoded a WebP in this process
/// (the libvips native loads), otherwise "unavailable". Deploy refuses to
/// finish on "unavailable": every product upload would fail.
/// </para>
/// </summary>
public sealed record ApiHealth(string Status, string Database, string Images);
