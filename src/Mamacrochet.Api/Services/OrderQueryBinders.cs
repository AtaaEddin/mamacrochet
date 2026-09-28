using System.Linq.Expressions;
using Mamacrochet.Api.Data;
using Mamacrochet.Api.QuerySpec;

namespace Mamacrochet.Api.Services;

/// <summary>
/// Per-endpoint field allowlists for the order query options (plan 04 D19
/// pattern). The customer binder is the tightest; staff adds the contact
/// search; admin adds customer/employee filters and the customer text.
/// </summary>
public static class OrderQueryBinders
{
    public static QueryBinder Customer()
    {
        return new QueryBinder()
            .Field("status", typeof(string), root => Expression.Property(root, nameof(Order.Status)))
            .SortField("createdAt", typeof(DateTime), root => Expression.Property(root, nameof(Order.CreatedAt)))
            .DefaultOrder("createdAt desc");
    }

    public static QueryBinder Staff()
    {
        return new QueryBinder()
            .Field("status", typeof(string), root => Expression.Property(root, nameof(Order.Status)))
            .TextField("contactName", (root, fn, value) => LikeExpressions.Call(
                Expression.Property(root, nameof(Order.ContactName)), value, fn))
            .SortField("createdAt", typeof(DateTime), root => Expression.Property(root, nameof(Order.CreatedAt)))
            .DefaultOrder("createdAt desc");
    }

    public static QueryBinder Admin()
    {
        return new QueryBinder()
            .Field("status", typeof(string), root => Expression.Property(root, nameof(Order.Status)))
            .Field("customerId", typeof(string), root => Expression.Property(root, nameof(Order.CustomerId)))
            .Field("employeeId", typeof(string), root => Expression.Property(root, nameof(Order.AssignedEmployeeId)))
            .TextField("customer", CustomerTextExpression)
            .SortField("createdAt", typeof(DateTime), root => Expression.Property(root, nameof(Order.CreatedAt)))
            .DefaultOrder("createdAt desc");
    }

    /// <summary>
    /// Customer text = the contact name OR the linked account's display name
    /// (guest orders have no account row yet).
    /// </summary>
    private static Expression CustomerTextExpression(ParameterExpression root, string fn, string value)
    {
        var contactLike = LikeExpressions.Call(
            Expression.Property(root, nameof(Order.ContactName)), value, fn);
        var customerLike = LikeExpressions.Call(
            Expression.Property(
                Expression.Property(root, nameof(Order.Customer)),
                nameof(AppUser.DisplayName)),
            value, fn);
        return Expression.OrElse(contactLike, customerLike);
    }
}
