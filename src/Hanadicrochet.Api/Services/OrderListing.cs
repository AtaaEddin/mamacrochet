using System.Linq.Expressions;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.QuerySpec;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Services;

/// <summary>
/// The order listing (plan 05): applies the OData-style query options
/// ($filter/$orderby/$top/$skip) through a per-endpoint allowlist binder,
/// on a role-scoped base query. Same contract as the product listing
/// (plan 04 D19): malformed/forbidden query → ApiError 400.
/// </summary>
public static class OrderListing
{
    public static async Task<(ApiError? Error, OrderListPage? Page)> ListAsync(
        IQueryable<Order> query,
        QueryBinder binder,
        IQueryCollection queryOptions,
        int defaultTop = 24,
        int maxTop = 96,
        CancellationToken ct = default)
    {
        Parsed parsed;
        try
        {
            parsed = QueryOptions.FromQuery(queryOptions, defaultTop, maxTop);
        }
        catch (QuerySpecException ex)
        {
            return (new ApiError("invalid", ex.Message), null);
        }

        if (parsed.Filter is not null)
        {
            try
            {
                var root = Expression.Parameter(typeof(Order), "o");
                var body = binder.BuildFilter(root, parsed.Filter);
                var lambda = Expression.Lambda<Func<Order, bool>>(body, root);
                query = query.Where(lambda);
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
            var root = Expression.Parameter(typeof(Order), "o");
            (order, descending) = binder.ResolveOrder(root, parsed.OrderBy);
        }
        catch (QuerySpecException ex)
        {
            return (new ApiError("invalid", ex.Message), null);
        }

        // The binder hands back an untyped lambda; re-type it for the
        // generic OrderBy/OrderByDescending (EF unwraps the boxed key).
        Expression<Func<Order, object>> keySelector = Expression.Lambda<Func<Order, object>>(
            Expression.Convert(order.Body, typeof(object)),
            order.Parameters);
        query = descending
            ? query.OrderByDescending(keySelector)
            : query.OrderBy(keySelector);

        var total = await query.CountAsync(ct);
        var items = await query
            .Skip(parsed.Skip)
            .Take(parsed.Top)
            .ToListAsync(ct);

        return (null, new OrderListPage(
            items,
            total,
            parsed.Skip / parsed.Top + 1,
            parsed.Top));
    }
}
