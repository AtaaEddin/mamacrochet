using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.QuerySpec;
using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Batch A of sub-plan 04: drives <see cref="ProductListing.ListAsync"/>
/// and the <see cref="ProductQueryBinders"/> factory methods directly
/// against the fixture database.
/// </summary>
public class ProductListingTests : IClassFixture<ApiTestFixture>
{
    private readonly ApiTestFixture _fx;

    public ProductListingTests(ApiTestFixture fx) => _fx = fx;

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

    private async Task<(ApiError? Error, ProductPage? Page)> ListAsync(
        AppDbContext db, QueryBinder binder, string raw, bool publicOnly)
    {
        return await ProductListing.ListAsync(db, binder, Q(raw), publicOnly, 24, 96);
    }

    private async Task<Product> CreateProductAsync(string title, int stock, bool listed)
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        // Tracked on purpose: assigning an untracked entity to a navigation
        // property would make EF treat it as Added on SaveChanges.
        var category = db.Categories
            .Where(c => c.DeletedAt == null)
            .OrderBy(c => c.Id)
            .First();

        var product = new Product
        {
            CategoryId = category!.Id,
            Price = 42,
            StockUnits = stock,
            IsListed = listed,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        product.Category = category; // covers the navigation property
        product.Translations.Add(new ProductTranslation
        {
            ProductId = product.Id,
            Language = "en",
            Title = title,
        });
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return product;
    }

    private async Task DeleteProductAsync(string id)
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var product = await db.Products
            .Include(p => p.Translations)
            .FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return;
        }

        db.Products.Remove(product);
        db.ProductTranslations.RemoveRange(product.Translations);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task List_Default_ReturnsSeededCatalog()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var (error, page) = await ListAsync(db, ProductQueryBinders.Public(), string.Empty, false);

        Assert.Null(error);
        Assert.NotNull(page);
        var total = await db.Products.AsNoTracking().CountAsync(p => p.DeletedAt == null);
        Assert.Equal(total, page!.Total);
        Assert.True(page.Items.Count <= 24);
    }

    [Fact]
    public async Task PublicOnly_HidesUnlisted_Product()
    {
        var unlisted = await CreateProductAsync("Unlisted zebra basket", 3, listed: false);
        try
        {
            using var scope = _fx.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var (errorAll, all) = await ListAsync(db, ProductQueryBinders.Public(), string.Empty, false);
            var (errorPublic, pub) = await ListAsync(db, ProductQueryBinders.Public(), string.Empty, true);

            Assert.Null(errorAll);
            Assert.Null(errorPublic);
            Assert.Contains(unlisted.Id, all!.Items.Select(p => p.Id));
            Assert.DoesNotContain(unlisted.Id, pub!.Items.Select(p => p.Id));
            Assert.Equal(all!.Total - 1, pub.Total);
        }
        finally
        {
            await DeleteProductAsync(unlisted.Id);
        }
    }

    [Fact]
    public async Task MalformedFilter_ReturnsInvalidApiError()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var (error, page) = await ListAsync(
            db, ProductQueryBinders.Public(), "$filter=category eq", false);

        Assert.Null(page);
        Assert.NotNull(error);
        Assert.Equal("invalid", error!.Code);
    }

    [Fact]
    public async Task UnknownField_ReturnsInvalidApiError()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // 'price' is on the staff allowlist, never on the public one.
        var (error, page) = await ListAsync(
            db, ProductQueryBinders.Public(), "$filter=price eq 5", false);

        Assert.Null(page);
        Assert.NotNull(error);
        Assert.Equal("invalid", error!.Code);
    }

    [Fact]
    public async Task CategoryFilter_KeepsOnlyThatCategory()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var category = db.Categories.AsNoTracking()
            .OrderBy(c => c.Id)
            .First();

        var (error, page) = await ListAsync(
            db,
            ProductQueryBinders.Public(),
            $"$filter=category eq '{category.Id}'",
            false);

        Assert.Null(error);
        Assert.NotNull(page);
        Assert.NotEmpty(page!.Items);
        Assert.All(page.Items, p => Assert.Equal(category.Id, p.Category!.Id));
    }

    [Fact]
    public async Task InStockFilter_KeepsOnlyStockedProducts()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var (error, page) = await ListAsync(
            db, ProductQueryBinders.Public(), "$filter=inStock eq true", false);

        Assert.Null(error);
        Assert.NotNull(page);
        Assert.All(page!.Items, p => Assert.True(p.InStock));
    }

    [Fact]
    public async Task TitleSearch_CaseInsensitive_Contains_And_Startswith()
    {
        var marker = $"Zebra{Guid.NewGuid():N}";
        var product = await CreateProductAsync($"{marker} bag", 1, listed: true);
        try
        {
            using var scope = _fx.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var (error, page) = await ListAsync(
                db,
                ProductQueryBinders.Public(),
                $"$filter=contains(title, '{marker.ToUpperInvariant()}')",
                false);
            Assert.Null(error);
            Assert.Contains(product.Id, page!.Items.Select(p => p.Id));

            var (errorStart, startPage) = await ListAsync(
                db,
                ProductQueryBinders.Public(),
                $"$filter=startswith(title, '{marker}')",
                false);
            Assert.Null(errorStart);
            Assert.Contains(product.Id, startPage!.Items.Select(p => p.Id));

            var (errorEnd, endPage) = await ListAsync(
                db,
                ProductQueryBinders.Public(),
                $"$filter=endswith(title, 'bag')",
                false);
            Assert.Null(errorEnd);
            Assert.Contains(product.Id, endPage!.Items.Select(p => p.Id));
        }
        finally
        {
            await DeleteProductAsync(product.Id);
        }
    }

    [Fact]
    public async Task OrderBy_CreatedAt_OrdersItems()
    {
        var first = await CreateProductAsync($"Listing first {Guid.NewGuid():N}", 1, true);
        var second = await CreateProductAsync($"Listing second {Guid.NewGuid():N}", 1, true);
        try
        {
            using var scope = _fx.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var (error, page) = await ListAsync(
                db, ProductQueryBinders.Public(), "$orderby=createdAt asc", false);
            Assert.Null(error);
            var timestamps = page!.Items.Select(p => p.CreatedAt).ToList();
            Assert.Equal(timestamps, timestamps.OrderBy(t => t));
            Assert.Contains(first.Id, page.Items.Select(p => p.Id));
            Assert.Contains(second.Id, page.Items.Select(p => p.Id));

            var (errorDesc, descPage) = await ListAsync(
                db, ProductQueryBinders.Public(), "$orderby=createdAt desc", false);
            Assert.Null(errorDesc);
            var reversed = descPage!.Items.Select(p => p.CreatedAt).ToList();
            Assert.Equal(reversed, reversed.OrderByDescending(t => t));
        }
        finally
        {
            await DeleteProductAsync(first.Id);
            await DeleteProductAsync(second.Id);
        }
    }

    [Fact]
    public async Task OrderBy_UnknownField_ReturnsInvalidApiError()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var (error, page) = await ListAsync(
            db, ProductQueryBinders.Public(), "$orderby=bogus asc", false);

        Assert.Null(page);
        Assert.NotNull(error);
        Assert.Equal("invalid", error!.Code);
    }

    [Fact]
    public async Task Top_And_Skip_Validation()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var (zeroError, zeroPage) = await ListAsync(
            db, ProductQueryBinders.Public(), "$top=0", false);
        Assert.Null(zeroPage);
        Assert.NotNull(zeroError);

        var (textError, textPage) = await ListAsync(
            db, ProductQueryBinders.Public(), "$top=abc", false);
        Assert.Null(textPage);
        Assert.NotNull(textError);

        var (skipError, skipPage) = await ListAsync(
            db, ProductQueryBinders.Public(), "$skip=-1", false);
        Assert.Null(skipPage);
        Assert.NotNull(skipError);

        var (ok, clamped) = await ListAsync(
            db, ProductQueryBinders.Public(), "$top=9999&$skip=0", false);
        Assert.Null(ok);
        Assert.NotNull(clamped);
        Assert.True(clamped!.Items.Count <= 96);
    }

    [Fact]
    public async Task StaffBinder_ExposesManagementFields()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var product = db.Products.AsNoTracking()
            .OrderBy(p => p.Id)
            .First();

        var (error, page) = await ListAsync(
            db,
            ProductQueryBinders.Staff(),
            $"$filter=id eq '{product.Id}'",
            false);
        Assert.Null(error);
        Assert.Single(page!.Items);
        Assert.Equal(product.Id, page.Items[0].Id);

        var (listedError, listedPage) = await ListAsync(
            db, ProductQueryBinders.Staff(), "$filter=isListed eq true", false);
        Assert.Null(listedError);
        Assert.All(listedPage!.Items, p => Assert.True(p.IsListed));

        var (priceError, pricePage) = await ListAsync(
            db, ProductQueryBinders.Staff(), "$filter=price gt 0", false);
        Assert.Null(priceError);
        Assert.All(pricePage!.Items, p => Assert.True(p.Price > 0));

        var (stockError, stockPage) = await ListAsync(
            db, ProductQueryBinders.Staff(), "$filter=stockUnits gt 0", false);
        Assert.Null(stockError);
        Assert.All(stockPage!.Items, p => Assert.True(p.StockUnits > 0));

        var (categoryError, categoryPage) = await ListAsync(
            db,
            ProductQueryBinders.Staff(),
            $"$filter=categoryId eq '{product.CategoryId}'",
            false);
        Assert.Null(categoryError);
        Assert.NotEmpty(categoryPage!.Items);
    }
}
