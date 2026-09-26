var builder = DistributedApplication.CreateBuilder(args);

// PostgreSQL (container) + application database.
var postgres = builder.AddPostgres("postgres");
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

// Next.js frontend dev server (pnpm dev in /frontend). Aspire injects the
// endpoint port via the PORT env var, which Next honors in dev.
// TODO(plan 02): evaluate Aspire 13 first-class Node hosting (AddNodeApp)
// and replace this executable when verified.
// Note: the Next.js dev server is NOT hosted by the AppHost in the scaffold —
// DCP's process proxy was unreliable for it in this environment. Run it in a
// second terminal (or use scripts/dev.sh): `cd frontend && pnpm dev -p 3001`.
// TODO(plan 02): re-evaluate Aspire 13 first-class Node hosting (AddNodeApp)
// for one-command dev when a stable pattern is verified.

builder.Build().Run();
