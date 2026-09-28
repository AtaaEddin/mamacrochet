namespace Hanadicrochet.Api.Models;

/// <summary>
/// GET /health response — the contract used by the frontend status pill,
/// the generated TS client (pnpm gen:api) and deploy health probes.
/// (Named ApiHealth to avoid clashing with HealthChecks.HealthReport.)
/// </summary>
public sealed record ApiHealth(string Status, string Database);
