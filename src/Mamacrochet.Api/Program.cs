using Mamacrochet.Api.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var connectionString = builder.Configuration.GetConnectionString("mamacrochet")
    ?? throw new InvalidOperationException("Connection string 'mamacrochet' is not configured.");

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// TLS is terminated by the reverse proxy (Caddy in prod, plan 10); the dev
// proxy from Aspire speaks plain HTTP, so no https redirection here.

app.MapGet("/health", (AppDbContext db) =>
{
    return Results.Ok(new
    {
        status = "ok",
        database = db.Database.CanConnect() ? "connected" : "unavailable",
    });
})
.WithName("Health");

app.Run();
