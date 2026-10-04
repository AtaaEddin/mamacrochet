using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// GuestLinkService (sub-plan 02): device id validity, first-account-wins
/// linking, and order backfill at registration.
/// </summary>
[Collection("Api")]
public class GuestLinkTests(ApiTestFixture _fx)
{
    private static (IServiceScope Scope, AppDbContext Db, GuestLinkService Svc) New(ApiTestFixture fx)
    {
        var scope = fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var svc = scope.ServiceProvider.GetRequiredService<GuestLinkService>();
        return (scope, db, svc);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-guid")]
    [InlineData("11111111-2222-3333-4444-555555555555")] // v3
    [InlineData("11111111-2222-1333-4444-555555555555")] // v1
    public static void IsValidGuestId_RejectsNonV4(string? id)
    {
        Assert.False(GuestLinkService.IsValidGuestId(id));
    }

    [Fact]
    public static void IsValidGuestId_AcceptsV4()
    {
        Assert.True(GuestLinkService.IsValidGuestId(Guid.NewGuid().ToString()));
    }

    [Fact]
    public async Task Link_LinksDeviceAndBackfillsOrders()
    {
        var (scope, db, svc) = New(_fx);
        using var d = scope;
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var guest = Guid.NewGuid().ToString();
        var order = Seed.Order(db, OrderStatus.Open, guestId: guest);
        await db.SaveChangesAsync();

        var r = await svc.LinkAsync(guest, customer.Id);

        Assert.Equal(GuestLinkStatus.Linked, r.Status);
        Assert.Null(r.LinkedUserId);
        Assert.NotNull(r.LinkedAt);
        await db.Entry(order).ReloadAsync();
        Assert.Equal(customer.Id, order.CustomerId);
    }

    [Fact]
    public async Task Link_SameAccount_IsIdempotent()
    {
        var (scope, db, svc) = New(_fx);
        using var d = scope;
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var guest = Guid.NewGuid().ToString();

        var first = await svc.LinkAsync(guest, customer.Id);
        var second = await svc.LinkAsync(guest, customer.Id);

        Assert.Equal(GuestLinkStatus.Linked, first.Status);
        Assert.Equal(GuestLinkStatus.Linked, second.Status);
        Assert.Equal(first.LinkedAt, second.LinkedAt);
    }

    [Fact]
    public async Task Link_DifferentAccount_FirstWins()
    {
        var (scope, db, svc) = New(_fx);
        using var d = scope;
        var firstUser = await TestUsers.CreateAsync(_fx, "customer");
        var secondUser = await TestUsers.CreateAsync(_fx, "customer");
        var guest = Guid.NewGuid().ToString();
        var order = Seed.Order(db, OrderStatus.Open, guestId: guest);
        await db.SaveChangesAsync();

        var r1 = await svc.LinkAsync(guest, firstUser.Id);
        var r2 = await svc.LinkAsync(guest, secondUser.Id);

        Assert.Equal(GuestLinkStatus.Linked, r1.Status);
        Assert.Equal(GuestLinkStatus.Conflict, r2.Status);
        Assert.Equal(firstUser.Id, r2.LinkedUserId);
        await db.Entry(order).ReloadAsync();
        Assert.Equal(firstUser.Id, order.CustomerId);
    }
}
