using System.Threading;
using System.Threading.RateLimiting;
using Hanadicrochet.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;
using Xunit;

namespace Hanadicrochet.Api.Tests;

[CollectionDefinition("Api")]
public sealed class ApiCollectionDefinition : ICollectionFixture<ApiTestFixture>
{
    public object[] CreateFixtures(ICollectionFixture<ApiTestFixture> fixture) => [fixture];
}

/// <summary>
/// One <see cref="WebApplicationFactory{Program}"/> per test run against a
/// dedicated Postgres database (created here, dropped on dispose). See plan
/// 20261004-0554_full-test-suite, sub-plan 01.
/// </summary>
/// <remarks>
/// xUnit v2 collection fixtures are disposed through the synchronous
/// <see cref="IDisposable"/> only, so all cleanup happens there.
/// </remarks>
public sealed class ApiTestFixture : IDisposable
{
    public const string MaintConnectionString =
        "Host=127.0.0.1;Port=5432;Username=postgres;Password=postgres;Database=postgres";

    public const string SeedAdminEmail = "seed-admin@hanadicrochet.test";
    public const string SeedAdminPassword = "SeedAdmin123!";

    private static int _clientCounter;

    public ApiTestFixture()
    {
        DbName = "hc_test_" + Guid.NewGuid().ToString("N")[..8];
        ConnectionString =
            $"Host=127.0.0.1;Port=5432;Username=postgres;Password=postgres;Database={DbName}";

        using (var conn = new NpgsqlConnection(MaintConnectionString))
        {
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"CREATE DATABASE {DbName};";
            cmd.ExecuteNonQuery();
        }

        UploadsRoot = Directory.CreateTempSubdirectory("hc-uploads-")!.FullName;

        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:hanadicrochet", ConnectionString);
            builder.UseSetting("Uploads:Root", UploadsRoot);
            builder.UseSetting("AdminSeed:Email", SeedAdminEmail);
            builder.UseSetting("AdminSeed:Password", SeedAdminPassword);
            // The D16 rate limiter is per-IP and in-memory — the suite shares
            // one loopback IP, so raise the (config-driven) budgets far above
            // any test volume. 429 paths are asserted at service level
            // (sub-plan 02), not over HTTP.
            builder.UseSetting("RateLimit:Guest", "100000");
            builder.UseSetting("RateLimit:Auth", "100000");
            builder.UseSetting("RateLimit:Default", "100000");
        });

        // Force app start (migrations + admin/catalog seeding run inline
        // before app.Run, so they are done by the time the server starts).
        _ = Factory.CreateClient();

        var configuration = Services.GetRequiredService<IConfiguration>();
        if (configuration["ConnectionStrings:hanadicrochet"] != ConnectionString
            || configuration["Uploads:Root"] != UploadsRoot)
        {
            var dump = string.Join("\n", configuration
                .AsEnumerable()
                .Where(k => k.Key.Contains("ConnectionStrings", StringComparison.OrdinalIgnoreCase)
                    || k.Key.Contains("Uploads", StringComparison.OrdinalIgnoreCase)
                    || k.Key.Contains("AdminSeed", StringComparison.OrdinalIgnoreCase))
                .Select(k => $"  {k.Key} = {k.Value}"));
            throw new InvalidOperationException(
                "Test configuration overrides were not applied (host configuration mismatch).\n" + dump);
        }
    }

    public WebApplicationFactory<Program> Factory { get; }

    public IServiceProvider Services => Factory.Services;

    public string DbName { get; }

    public string ConnectionString { get; }

    public string UploadsRoot { get; }

    public HttpClient CreateClient()
    {
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Add(
            "X-Test-Client",
            $"client-{Interlocked.Increment(ref _clientCounter)}");
        return client;
    }

    /// <summary>Fresh DI scope; the scope's <see cref="AppDbContext"/> is the
    /// same instance services in that scope receive.</summary>
    public IServiceScope CreateScope() => Services.CreateScope();

    public void Dispose()
    {
        Factory.Dispose();

        try
        {
            using var conn = new NpgsqlConnection(MaintConnectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"DROP DATABASE IF EXISTS {DbName} WITH (FORCE);";
            cmd.ExecuteNonQuery();
        }
        catch (NpgsqlException)
        {
            // Best-effort cleanup.
        }

        try
        {
            if (Directory.Exists(UploadsRoot))
            {
                Directory.Delete(UploadsRoot, true);
            }
        }
        catch (IOException)
        {
            // Best-effort cleanup.
        }
    }
}
