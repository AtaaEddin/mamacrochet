using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Services;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.QuerySpec;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Batch A of sub-plan 04: drives <see cref="OrderListing.ListAsync"/> and
/// the <see cref="OrderQueryBinders"/> factory methods directly against the
/// fixture database.
/// </summary>
public class OrderListingTests : IClassFixture<ApiTestFixture>
{
    private readonly ApiTestFixture _fx;

    public OrderListingTests(ApiTestFixture fx) => _fx = fx;

    private static IQueryCollection Q(string raw)
    {
        var dict = new Dictionary<string, StringValues>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in raw.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = pair.Split('=', 2);
            dict[kv[0]] = new StringValues(kv.Length == 2 ? kv[1] : null);
        }

        return new QueryCollection(dict);
    }

    private async Task<(ApiError? Error, OrderListPage? Page)> ListAsync(
        QueryBinder binder, string raw, IQueryable<Order>? query = null)
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await OrderListing.ListAsync(
            query ?? db.Orders.AsNoTracking(), binder, Q(raw), 24, 96);
    }

    private async Task<Order> CreateOrderAsync(string contactName, string status, AppUser? customer = null)
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var order = new Order
        {
            Kind = "catalog",
            Status = status,
            ContactName = contactName,
            ContactPhone = "+1 555 0199",
            ContactEmail = $"{TestUsers.UniqueEmail("orderlisting")}@example.test",
            CustomerId = customer?.Id,
            GuestId = Guid.NewGuid().ToString("N"),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        if (customer is not null)
        {
            // Load tracked in THIS context: assigning the caller's (already
            // detached) instance would make EF treat it as Added.
            order.Customer = await db.Users.FirstAsync(u => u.Id == customer.Id);
        }

        db.Orders.Add(order);
        await db.SaveChangesAsync();
        return order;
    }

    private async Task<AppUser> CreateUserAsync(string displayName)
    {
        var email = TestUsers.UniqueEmail("orderlisting-cust") + "@example.test";
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var user = new AppUser
        {
            UserName = email,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = displayName,
            Language = "en",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private async Task CleanupAsync(params Order[] orders)
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Orders.RemoveRange(orders);
        db.Users.RemoveRange(orders.Where(o => o.CustomerId is not null)
            .Select(o => o.Customer!)
            .Where(c => c is not null));
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task CustomerBinder_StatusFilter_AndCreatedAtOrder()
    {
        var open = await CreateOrderAsync($"ZetaCustomer {Guid.NewGuid():N}", OrderStatus.Open);
        var closed = await CreateOrderAsync($"ZetaCustomer {Guid.NewGuid():N}", OrderStatus.Closed);
        try
        {
            var (error, page) = await ListAsync(
                OrderQueryBinders.Customer(), "$filter=status eq 'open'");

            Assert.Null(error);
            Assert.NotNull(page);
            Assert.NotEmpty(page!.Items);
            Assert.All(page.Items, o => Assert.Equal(OrderStatus.Open, o.Status));
            Assert.Contains(open.Id, page.Items.Select(o => o.Id));
            Assert.DoesNotContain(closed.Id, page.Items.Select(o => o.Id));

            var (orderError, ordered) = await ListAsync(
                OrderQueryBinders.Customer(), "$orderby=createdAt desc");
            Assert.Null(orderError);
            var timestamps = ordered!.Items.Select(o => o.CreatedAt).ToList();
            Assert.Equal(timestamps, timestamps.OrderByDescending(t => t));
        }
        finally
        {
            await CleanupAsync(open, closed);
        }
    }

    [Fact]
    public async Task CustomerBinder_ForbidsStaffFields()
    {
        // contactName is on the staff/admin allowlists, never on the
        // customer one.
        var (error, page) = await ListAsync(
            OrderQueryBinders.Customer(), "$filter=contactName eq 'Zzz'");

        Assert.Null(page);
        Assert.NotNull(error);
        Assert.Equal("invalid", error!.Code);
    }

    [Fact]
    public async Task StaffBinder_ContactName_TextSearch()
    {
        var marker = $"Zedstaff{Guid.NewGuid():N}";
        var order = await CreateOrderAsync($"{marker} client", OrderStatus.InProgress);
        try
        {
            var (error, page) = await ListAsync(
                OrderQueryBinders.Staff(),
                $"$filter=contains(contactName, '{marker}')");

            Assert.Null(error);
            Assert.NotNull(page);
            Assert.Contains(order.Id, page!.Items.Select(o => o.Id));

            var (startError, startPage) = await ListAsync(
                OrderQueryBinders.Staff(),
                $"$filter=startswith(contactName, '{marker}')");
            Assert.Null(startError);
            Assert.Contains(order.Id, startPage!.Items.Select(o => o.Id));
        }
        finally
        {
            await CleanupAsync(order);
        }
    }

    [Fact]
    public async Task AdminBinder_CustomerId_EmployeeId_AndCustomerText()
    {
        var user = await CreateUserAsync($"ZedAdminCust {Guid.NewGuid():N}");
        var order = await CreateOrderAsync("Some contact", OrderStatus.Open, user);
        try
        {
            var (error, page) = await ListAsync(
                OrderQueryBinders.Admin(),
                $"$filter=customerId eq '{user.Id}'");
            Assert.Null(error);
            Assert.Single(page!.Items);
            Assert.Equal(order.Id, page.Items[0].Id);

            var (textError, textPage) = await ListAsync(
                OrderQueryBinders.Admin(),
                $"$filter=contains(customer, '{user.DisplayName}')");
            Assert.Null(textError);
            Assert.Contains(order.Id, textPage!.Items.Select(o => o.Id));

            // The same text also matches a plain contact name (contact OR
            // linked display name).
            var contactMarker = $"ZedContact {Guid.NewGuid():N}";
            var contactOrder = await CreateOrderAsync(contactMarker, OrderStatus.Open);
            try
            {
                var (contactError, contactPage) = await ListAsync(
                    OrderQueryBinders.Admin(),
                    $"$filter=contains(customer, '{contactMarker}')");
                Assert.Null(contactError);
                Assert.Contains(contactOrder.Id, contactPage!.Items.Select(o => o.Id));
            }
            finally
            {
                await CleanupAsync(contactOrder);
            }
        }
        finally
        {
            await CleanupAsync(order);
        }
    }

    [Fact]
    public async Task Paging_Top_Skip_PageNumber()
    {
        var first = await CreateOrderAsync("PageOne", "open");
        var second = await CreateOrderAsync("PageTwo", "open");
        try
        {
            using var scope = _fx.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var (error, page) = await ListAsync(
                OrderQueryBinders.Customer(), "$top=1&$skip=1");

            Assert.Null(error);
            Assert.Single(page!.Items);
            Assert.Equal(1, page.PageSize);
            Assert.Equal(2, page.Page);

            var (totalError, fullPage) = await ListAsync(
                OrderQueryBinders.Customer(), string.Empty);
            Assert.Null(totalError);
            Assert.Equal(
                await db.Orders.AsNoTracking().CountAsync(), fullPage!.Total);
        }
        finally
        {
            await CleanupAsync(first, second);
        }
    }

    [Fact]
    public async Task MalformedQuery_ReturnsInvalidApiError()
    {
        var (error, page) = await ListAsync(
            OrderQueryBinders.Admin(), "$filter=status");

        Assert.Null(page);
        Assert.NotNull(error);
        Assert.Equal("invalid", error!.Code);
    }

    [Fact]
    public async Task Orderby_UnknownField_ReturnsInvalidApiError()
    {
        var (error, page) = await ListAsync(
            OrderQueryBinders.Customer(), "$orderby=bogus desc");

        Assert.Null(page);
        Assert.NotNull(error);
        Assert.Equal("invalid", error!.Code);
    }

    [Fact]
    public async Task StaffBinder_StatusFilter_Works()
    {
        var order = await CreateOrderAsync($"ZedStatus {Guid.NewGuid():N}", OrderStatus.Open);
        try
        {
            var (error, page) = await ListAsync(
                OrderQueryBinders.Staff(), "$filter=status eq 'open'");

            Assert.Null(error);
            Assert.NotNull(page);
            Assert.Contains(order.Id, page!.Items.Select(o => o.Id));
            Assert.All(page.Items, o => Assert.Equal(OrderStatus.Open, o.Status));
        }
        finally
        {
            await CleanupAsync(order);
        }
    }

    [Fact]
    public async Task AdminBinder_StatusAndEmployeeIdFilters_Works()
    {
        var order = await CreateOrderAsync($"ZedAdminStatus {Guid.NewGuid():N}", OrderStatus.Open);
        try
        {
            var (error, page) = await ListAsync(
                OrderQueryBinders.Admin(), "$filter=status eq 'open'");
            Assert.Null(error);
            Assert.Contains(order.Id, page!.Items.Select(o => o.Id));

            var (empError, empPage) = await ListAsync(
                OrderQueryBinders.Admin(),
                $"$filter=employeeId eq '{Guid.NewGuid():N}'");
            Assert.Null(empError);
            Assert.Empty(empPage!.Items);
        }
        finally
        {
            await CleanupAsync(order);
        }
    }
}
