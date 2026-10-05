using System.Reflection;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// The two daily sweep hosted services (D9: no busy workers). Their
/// RunOnceAsync is private by design — the hosted loop runs it every 24 h —
/// so the tests invoke it via reflection and assert the DB/file side
/// effects on a real database (plan 20261005-1348/02).
/// </summary>
public class SweepServiceTests : IClassFixture<ApiTestFixture>
{
    private readonly ApiTestFixture _fx;

    public SweepServiceTests(ApiTestFixture fx) => _fx = fx;

    private static async Task RunOnceAsync(object sweepService)
    {
        var method = sweepService.GetType().GetMethod(
            "RunOnceAsync", BindingFlags.NonPublic | BindingFlags.Instance);
        Assert.NotNull(method);
        await (Task)method!.Invoke(
            sweepService, new object?[] { CancellationToken.None })!;
    }

    /// <summary>The root scope factory — the sweep opens its own scope/DB.</summary>
    private IServiceScopeFactory ScopeFactory()
    {
        using var scope = _fx.CreateScope();
        return scope.ServiceProvider.GetRequiredService<IServiceScopeFactory>();
    }

    [Fact]
    public async Task ChatSweep_ClosesStaleVisitorThreads_PurgesOldOrphanAttachments()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var staleVisitor = new ChatThread
        {
            Kind = "visitor",
            GuestId = "sweep-stale-device",
            IsClosed = false,
            CreatedAt = DateTime.UtcNow.AddDays(-40),
            UpdatedAt = DateTime.UtcNow.AddDays(-40),
            LastMessageAt = DateTime.UtcNow.AddDays(-40),
        };
        var freshVisitor = new ChatThread
        {
            Kind = "visitor",
            GuestId = "sweep-fresh-device",
            IsClosed = false,
            CreatedAt = DateTime.UtcNow.AddDays(-2),
            UpdatedAt = DateTime.UtcNow,
            LastMessageAt = DateTime.UtcNow,
        };
        // Stale but an ORDER thread — the sweep must leave it alone.
        var customer = await TestUsers.CreateAsync(_fx, role: "customer");
        var staleOrderThread = new ChatThread
        {
            Kind = "order",
            CustomerId = customer.Id,
            IsClosed = false,
            CreatedAt = DateTime.UtcNow.AddDays(-40),
            UpdatedAt = DateTime.UtcNow.AddDays(-40),
            LastMessageAt = DateTime.UtcNow.AddDays(-40),
        };
        db.ChatThreads.AddRange(staleVisitor, freshVisitor, staleOrderThread);

        // Orphan attachments (uploaded, never attached to a message).
        var oldOrphan = new ChatAttachment
        {
            ThreadId = staleVisitor.Id,
            StoredName = "sweep-old-orphan.png",
            OriginalName = "old.png",
            ContentType = "image/png",
            Bytes = 4,
            CreatedAt = DateTime.UtcNow.AddHours(-30),
        };
        var freshOrphan = new ChatAttachment
        {
            ThreadId = freshVisitor.Id,
            StoredName = "sweep-fresh-orphan.png",
            OriginalName = "fresh.png",
            ContentType = "image/png",
            Bytes = 4,
            CreatedAt = DateTime.UtcNow.AddHours(-1),
        };
        db.ChatAttachments.AddRange(oldOrphan, freshOrphan);
        await db.SaveChangesAsync();

        var oldPath = Path.Combine(_fx.UploadsRoot, "chat", staleVisitor.Id, oldOrphan.StoredName);
        var freshPath = Path.Combine(_fx.UploadsRoot, "chat", freshVisitor.Id, freshOrphan.StoredName);
        Directory.CreateDirectory(Path.GetDirectoryName(oldPath)!);
        Directory.CreateDirectory(Path.GetDirectoryName(freshPath)!);
        File.WriteAllBytes(oldPath, new byte[4]);
        File.WriteAllBytes(freshPath, new byte[4]);

        // Run the sweep once (no 24 h wait) — it uses its own DB scope.
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<ChatSweepService>>();
        await RunOnceAsync(new ChatSweepService(ScopeFactory(), logger));

        // Assert on a FRESH context (the sweep's changes are committed).
        using var check = _fx.CreateScope();
        var db2 = check.ServiceProvider.GetRequiredService<AppDbContext>();

        var stale = await db2.ChatThreads.AsNoTracking().SingleAsync(t => t.Id == staleVisitor.Id);
        Assert.True(stale.IsClosed);
        Assert.Equal("auto_inactivity", stale.ClosedReason);
        Assert.NotNull(stale.ClosedAt);

        var fresh = await db2.ChatThreads.AsNoTracking().SingleAsync(t => t.Id == freshVisitor.Id);
        Assert.False(fresh.IsClosed);

        var orderThread = await db2.ChatThreads.AsNoTracking().SingleAsync(t => t.Id == staleOrderThread.Id);
        Assert.False(orderThread.IsClosed, "order threads are never auto-closed by the chat sweep");

        // Old orphan: row AND file gone; fresh orphan untouched.
        Assert.Equal(0, await db2.ChatAttachments.AsNoTracking().CountAsync(a => a.Id == oldOrphan.Id));
        Assert.False(File.Exists(oldPath));
        Assert.Equal(1, await db2.ChatAttachments.AsNoTracking().CountAsync(a => a.Id == freshOrphan.Id));
        Assert.True(File.Exists(freshPath));
    }

    [Fact]
    public async Task ChatSweep_WithNothingStale_DoesNoWork()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var freshVisitor = new ChatThread
        {
            Kind = "visitor",
            GuestId = "sweep-noop-device",
            IsClosed = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            LastMessageAt = DateTime.UtcNow,
        };
        db.ChatThreads.Add(freshVisitor);
        await db.SaveChangesAsync();

        var logger = scope.ServiceProvider.GetRequiredService<ILogger<ChatSweepService>>();
        await RunOnceAsync(new ChatSweepService(ScopeFactory(), logger));

        using var check = _fx.CreateScope();
        var db2 = check.ServiceProvider.GetRequiredService<AppDbContext>();
        var thread = await db2.ChatThreads.AsNoTracking().SingleAsync(t => t.Id == freshVisitor.Id);
        Assert.False(thread.IsClosed);
    }

    [Fact]
    public async Task OrderSweep_CancelsStaleGuestOrders_LeavesOthersAlone()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var staleOpenGuest = new Order
        {
            Kind = "custom",
            Status = OrderStatus.Open,
            GuestId = "sweep-order-open",
            ContactName = "Stale Open",
            ContactPhone = "+1 555 0000",
            CreatedAt = DateTime.UtcNow.AddDays(-10),
            UpdatedAt = DateTime.UtcNow.AddDays(-10),
        };
        var staleWorkingGuest = new Order
        {
            Kind = "custom",
            Status = OrderStatus.InProgress,
            GuestId = "sweep-order-working",
            ContactName = "Stale Working",
            ContactPhone = "+1 555 0001",
            CreatedAt = DateTime.UtcNow.AddDays(-10),
            UpdatedAt = DateTime.UtcNow.AddDays(-2),
        };
        // Stale but belongs to an ACCOUNT — guests-only sweep leaves it.
        var customer = await TestUsers.CreateAsync(_fx, role: "customer");
        var staleCustomerOrder = new Order
        {
            Kind = "custom",
            Status = OrderStatus.Open,
            CustomerId = customer.Id,
            ContactName = "Stale Customer",
            ContactPhone = "+1 555 0002",
            CreatedAt = DateTime.UtcNow.AddDays(-10),
            UpdatedAt = DateTime.UtcNow.AddDays(-10),
        };
        var freshGuest = new Order
        {
            Kind = "catalog",
            Status = OrderStatus.Open,
            GuestId = "sweep-order-fresh",
            ContactName = "Fresh Guest",
            ContactPhone = "+1 555 0003",
            CreatedAt = DateTime.UtcNow.AddDays(-1),
            UpdatedAt = DateTime.UtcNow.AddDays(-1),
        };
        db.Orders.AddRange(staleOpenGuest, staleWorkingGuest, staleCustomerOrder, freshGuest);
        await db.SaveChangesAsync();

        var logger = scope.ServiceProvider.GetRequiredService<ILogger<OrderSweepService>>();
        await RunOnceAsync(new OrderSweepService(ScopeFactory(), logger));

        using var check = _fx.CreateScope();
        var db2 = check.ServiceProvider.GetRequiredService<AppDbContext>();

        foreach (var id in new[] { staleOpenGuest.Id, staleWorkingGuest.Id })
        {
            var order = await db2.Orders.AsNoTracking()
                .Include(o => o.Timeline).SingleAsync(o => o.Id == id);
            Assert.Equal(OrderStatus.Cancelled, order.Status);
            var autoEvent = order.Timeline.Single(e => e.Kind == "auto");
            Assert.Equal(OrderStatus.Cancelled, autoEvent.Status);
            Assert.Equal("system", autoEvent.ActorRole);
        }

        var customerOrder = await db2.Orders.AsNoTracking().SingleAsync(o => o.Id == staleCustomerOrder.Id);
        Assert.Equal(OrderStatus.Open, customerOrder.Status);

        var fresh = await db2.Orders.AsNoTracking().SingleAsync(o => o.Id == freshGuest.Id);
        Assert.Equal(OrderStatus.Open, fresh.Status);
    }

    [Fact]
    public async Task OrderSweep_WithNothingStale_DoesNoWork()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var freshGuest = new Order
        {
            Kind = "catalog",
            Status = OrderStatus.Open,
            GuestId = "sweep-order-noop",
            ContactName = "Fresh",
            ContactPhone = "+1 555 0004",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Orders.Add(freshGuest);
        await db.SaveChangesAsync();

        var logger = scope.ServiceProvider.GetRequiredService<ILogger<OrderSweepService>>();
        await RunOnceAsync(new OrderSweepService(ScopeFactory(), logger));

        using var check = _fx.CreateScope();
        var db2 = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(
            OrderStatus.Open,
            (await db2.Orders.AsNoTracking().SingleAsync(o => o.Id == freshGuest.Id)).Status);
    }
}
