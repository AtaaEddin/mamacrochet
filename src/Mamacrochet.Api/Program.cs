using Mamacrochet.Api.Data;
using Mamacrochet.Api.Models;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

// Aspire service defaults: OpenTelemetry (logs/metrics/traces to the dashboard),
// health checks, service discovery, HttpClient resilience.
builder.AddServiceDefaults();

builder.Services.AddOpenApi(options =>
{
    // Expose the /health response schema in the OpenAPI document so the
    // generated frontend client (pnpm gen:api) is fully typed.
    options.AddOperationTransformer(async (operation, context, ct) =>
    {
        if (operation.OperationId != "Health")
        {
            return;
        }

        var schema = await context.GetOrCreateSchemaAsync(typeof(ApiHealth), null, ct);
        context.Document?.AddComponent("ApiHealth", schema);
        operation.Responses ??= new OpenApiResponses();
        operation.Responses["200"] = new OpenApiResponse
        {
            Description = "OK",
            Content = new Dictionary<string, OpenApiMediaType>
            {
                [
                    "application/json"] = new()
                {
                    Schema = new OpenApiSchemaReference("ApiHealth", context.Document),
                },
            },
        };
    });
});

var connectionString = builder.Configuration.GetConnectionString("mamacrochet")
    ?? throw new InvalidOperationException("Connection string 'mamacrochet' is not configured.");

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

// The browser talks to the API cross-origin in dev (Next dev server on its own
// port). The allowed origins are injected by the AppHost from the web endpoint.
var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    policy.AllowAnyHeader().AllowAnyMethod();
    if (corsOrigins.Length > 0)
    {
        policy.WithOrigins(corsOrigins);
    }
    else
    {
        // Standalone dev (no AppHost): allow localhost origins of any port.
        policy.WithOrigins(
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001");
    }
}));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// TLS is terminated by the reverse proxy (Caddy in prod, plan 10); the dev
// proxy from Aspire speaks plain HTTP, so no https redirection here.

app.UseCors();

app.MapGet("/health", (AppDbContext db) =>
{
    return Results.Ok(new ApiHealth(
        Status: "ok",
        Database: db.Database.CanConnect() ? "connected" : "unavailable"));
})
.WithName("Health");

// Liveness from the service defaults. We do NOT call MapDefaultEndpoints():
// it would remap /health as a generic text health check, while the JSON
// /health above (with the live DB check) is the contract the frontend pill
// and the deploy health probes use.
app.MapHealthChecks("/alive", new HealthCheckOptions
{
    Predicate = r => r.Tags.Contains("live"),
});

app.Run();
