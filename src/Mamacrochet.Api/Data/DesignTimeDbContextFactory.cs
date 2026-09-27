using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Mamacrochet.Api.Data;

/// <summary>
/// Design-time context for the EF CLI (migrations, database update).
/// Connection string: MAMACROCHET_CONNECTIONSTRING env var first (so
/// Aspire-injected values win when running from the stack), then the
/// appsettings.json copied to the build output, then a localhost default.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("MAMACROCHET_CONNECTIONSTRING");

        if (string.IsNullOrEmpty(connectionString))
        {
            var settingsPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
            if (File.Exists(settingsPath))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(settingsPath));
                connectionString = doc.RootElement
                    .GetProperty("ConnectionStrings")
                    .GetProperty("mamacrochet")
                    .GetString();
            }
        }

        connectionString ??= "Host=localhost;Port=5432;Database=mamacrochet;Username=postgres;Password=postgres";

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new AppDbContext(options);
    }
}
