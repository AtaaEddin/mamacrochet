var builder = DistributedApplication.CreateBuilder(args);

// PostgreSQL (container) + application database.
// Port + credentials are pinned so `dotnet ef` design-time runs (which fall
// back to localhost:5432/postgres/postgres) match the container.
// Aspire 13: AddParameter(name, value, publishValueAsDefault, secret) pins the
// literal value (no publishing — dev only, prod composes its own compose env).
var postgresUser = builder.AddParameter("postgres-username", "postgres", false, secret: false);
var postgresPass = builder.AddParameter("postgres-password", "postgres", false, secret: true);
var postgres = builder.AddPostgres(
    "postgres",
    postgresUser,
    postgresPass,
    port: 5432);
// Named volume: DCP recreates the container on every stack (re)start, so an
// anonymous volume would wipe the dev database each restart.
postgres.WithDataVolume("mamacrochet-postgres-data", false);
var database = postgres.AddDatabase("mamacrochet");

// ASP.NET Core API (EF Core uses the connection string Aspire injects:
// ConnectionStrings__mamacrochet).
var api = builder.AddProject<Projects.Mamacrochet_Api>("api")
    .WithReference(database)
    .WaitFor(database)
    // Fixed dev ports (scaffold simplicity; 8080 is taken by local llama-server);
    // prod uses docker-compose (plan 10).
    .WithHttpEndpoint(name: "http", port: 8085)
    .WithExternalHttpEndpoints();

// Next.js frontend dev server (pnpm, run script "dev" = `next dev`).
// AddNextJsApp passes the assigned port to `next dev -p` and auto-installs
// dependencies (pnpm). The dashboard shows postgres + api + web together —
// this AppHost is the ONLY way to run the dev stack (scripts/dev.sh retired).
// AddNextJsApp is experimental in Aspire 13.x (ASPIREJAVASCRIPT001); it is
// dev-only orchestration — prod runs the docker-compose stack (plan 10).
#pragma warning disable ASPIREJAVASCRIPT001
var web = builder.AddNextJsApp("web", "../../frontend")
    .WithPnpm()
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithEnvironment("NEXT_PUBLIC_API_URL", api.GetEndpoint("http"))
    .WithExternalHttpEndpoints();
#pragma warning restore ASPIREJAVASCRIPT001

// The API accepts cross-origin browser requests only from the web endpoint.
api.WithEnvironment("Cors__Origins", web.GetEndpoint("http"));

builder.Build().Run();
