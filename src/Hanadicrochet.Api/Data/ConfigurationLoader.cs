using Microsoft.Extensions.Configuration;

namespace Hanadicrochet.Api.Data;

/// <summary>
/// Loads configuration for design-time use (EF CLI) the same way the app does:
/// environment variables first, then appsettings.json next to the executable.
/// </summary>
internal static class ConfigurationLoader
{
    public static IConfigurationRoot Load()
    {
        var builder = new ConfigurationBuilder()
            .AddEnvironmentVariables()
            .AddJsonFile("appsettings.json", optional: true);

        return builder.Build();
    }
}
