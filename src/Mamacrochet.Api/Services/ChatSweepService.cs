using Microsoft.EntityFrameworkCore;

namespace Mamacrochet.Api.Services;

/// <summary>
/// Chat hygiene sweep (plan 06, D9: lazy/daily, no busy worker): every 24 h,
/// close visitor threads idle for 30 days (D16) and purge attachments that
/// were uploaded but never attached to a message (24 h). The stale-close also
/// runs lazily before the staff inbox list, so the sweep is a net, not the
/// only path (same shape as OrderSweepService).
/// </summary>
public sealed class ChatSweepService(
    IServiceScopeFactory scopes,
    ILogger<ChatSweepService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app (and Migrate()) settle before the first pass.
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);
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
            var service = scope.ServiceProvider.GetRequiredService<ChatService>();
            var closed = await service.CloseStaleVisitorThreadsAsync(ct);
            var purged = await service.PurgeOrphanAttachmentsAsync(ct);
            if (closed > 0 || purged > 0)
            {
                logger.LogInformation(
                    "Chat sweep: closed {Closed} stale visitor thread(s), purged {Purged} orphan file(s).",
                    closed, purged);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Chat sweep failed.");
        }
    }
}
