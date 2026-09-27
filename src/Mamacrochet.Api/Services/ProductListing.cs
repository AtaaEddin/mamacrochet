using System.Linq.Expressions;
using Mamacrochet.Api.Data;
using Mamacrochet.Api.Models;
using Mamacrochet.Api.QuerySpec;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Mamacrochet.Api.Services;

/// <summary>
/// Applies the OData-style query options ($filter/$orderby/$top/$skip)
/// against the product table through a per-endpoint allowlist binder
/// (plan 04 D19). Any malformed/forbidden query piece → ApiError 400.
/// </summary>
public static class ProductListing
{
    public static async Task<(ApiError? Error, ProductPage? Page)> ListAsync(
        AppDbContext db,
        QueryBinder binder,
        IQueryCollection query,
        bool publicOnly,
        int defaultTop,
        int maxTop,
        CancellationToken ct = default)
    {
        Parsed parsed;
        try
        {
            parsed = QueryOptions.FromQuery(query, defaultTop, maxTop);
        }
        catch (QuerySpecException ex)
        {
            return (new ApiError("invalid", ex.Message), null);
        }

        IQueryable<Product> products = db.Products
            .AsNoTracking()
            .Include(p => p.Translations)
            .Include(p => p.Images)
            .Include(p => p.Category)
            .ThenInclude(c => c!.Translations)
            .Where(p => p.DeletedAt == null);

        if (publicOnly)
        {
            products = products.Where(p => p.IsListed);
        }

        if (parsed.Filter is not null)
        {
            try
            {
                var root = Expression.Parameter(typeof(Product), "p");
                var body = binder.BuildFilter(root, parsed.Filter);
                var lambda = Expression.Lambda<Func<Product, bool>>(body, root);
                products = products.Where(lambda);
            }
            catch (QuerySpecException ex)
            {
                return (new ApiError("invalid", ex.Message), null);
            }
        }

        LambdaExpression order;
        bool descending;
        try
        {
            var root = Expression.Parameter(typeof(Product), "p");
            (order, descending) = binder.ResolveOrder(root, parsed.OrderBy);
        }
        catch (QuerySpecException ex)
        {
            return (new ApiError("invalid", ex.Message), null);
        }

        // The binder hands back an untyped lambda; re-type it for the
        // generic OrderBy/OrderByDescending (EF unwraps the boxed key).
        Expression<Func<Product, object>> keySelector = Expression.Lambda<Func<Product, object>>(
            Expression.Convert(order.Body, typeof(object)),
            order.Parameters);
        products = descending
            ? products.OrderByDescending(keySelector)
            : products.OrderBy(keySelector);

        var total = await products.CountAsync(ct);
        var items = await products
            .Skip(parsed.Skip)
            .Take(parsed.Top)
            .ToListAsync(ct);

        var page = parsed.Skip / parsed.Top + 1;
        return (null, new ProductPage(
            items.Select(ProductDto.From).ToList(),
            total,
            page,
            parsed.Top));
    }
}
