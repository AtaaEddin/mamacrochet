using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Mamacrochet.Api.Services;

/// <summary>
/// Auto-cancel sweep (D16): unconfirmed guest orders older than 7 days are
/// cancelled (plan 05). The same method runs lazily on order reads, so the
/// sweep is a hygiene net, not the only path.
/// </summary>
public sealed class OrderSweepService(
    IServiceScopeFactory scopes,
    ILogger<OrderSweepService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app (and Migrate()) settle before the first pass.
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            await RunOnceAsync(stoppingToken);
            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<OrderService>();
            var count = await service.EnsureAutoCancelledAsync(ct);
            if (count > 0)
            {
                logger.LogInformation("Order sweep: auto-cancelled {Count} stale guest order(s).", count);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Order sweep failed.");
        }
    }
}
