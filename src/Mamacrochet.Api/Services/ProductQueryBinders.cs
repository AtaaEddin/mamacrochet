using System.Linq.Expressions;
using System.Reflection;
using Mamacrochet.Api.Data;
using Mamacrochet.Api.QuerySpec;

namespace Mamacrochet.Api.Services;

/// <summary>
/// Per-endpoint field allowlists for the OData-style query layer (plan 04
/// D19). Public endpoints only expose the public subset; staff endpoints
/// add the management fields. Unknown field/operator → 400 at bind time.
/// </summary>
public static class ProductQueryBinders
{
    private static readonly MethodInfo AnyWithPredicate =
        typeof(Enumerable).GetMethods()
            .First(m => m.Name == "Any"
                && m.GetGenericArguments().Length == 1
                && m.GetParameters().Length == 2)
        .MakeGenericMethod(typeof(ProductTranslation));

    public static QueryBinder Public()
    {
        return new QueryBinder(typeof(Product))
            .Field("category", typeof(string), root => Expression.Property(root, nameof(Product.CategoryId)))
            .Field("inStock", typeof(bool), InStockExpression)
            .TextField("title", TitleTextExpression)
            .SortField("createdAt", typeof(DateTime), root => Expression.Property(root, nameof(Product.CreatedAt)))
            .DefaultOrder("createdAt desc");
    }

    public static QueryBinder Staff()
    {
        return new QueryBinder(typeof(Product))
            .Field("id", typeof(string), root => Expression.Property(root, nameof(Product.Id)))
            .Field("categoryId", typeof(string), root => Expression.Property(root, nameof(Product.CategoryId)))
            .Field("inStock", typeof(bool), InStockExpression)
            .Field("isListed", typeof(bool), root => Expression.Property(root, nameof(Product.IsListed)))
            .Field("price", typeof(decimal), root => Expression.Property(root, nameof(Product.Price)))
            .Field("stockUnits", typeof(int), root => Expression.Property(root, nameof(Product.StockUnits)))
            .Field("createdAt", typeof(DateTime), root => Expression.Property(root, nameof(Product.CreatedAt)))
            .TextField("title", TitleTextExpression)
            .DefaultOrder("createdAt desc");
    }

    private static Expression InStockExpression(ParameterExpression root)
    {
        return Expression.GreaterThan(
            Expression.Property(root, nameof(Product.StockUnits)),
            Expression.Constant(0));
    }

    /// <summary>
    /// Localized title search: matches a translation in any language
    /// (ILIKE, Postgres case-insensitive).
    /// </summary>
    private static Expression TitleTextExpression(ParameterExpression root, string fn, string value)
    {
        var t = Expression.Parameter(typeof(ProductTranslation), "t");
        var like = LikeExpressions.Call(
            Expression.Property(t, nameof(ProductTranslation.Title)),
            value,
            fn);
        var predicate = Expression.Lambda<Func<ProductTranslation, bool>>(like, t);
        // Enumerable.Any is a static extension method: null instance, source first.
        return Expression.Call(
            null,
            AnyWithPredicate,
            Expression.Property(root, nameof(Product.Translations)),
            predicate);
    }
}
