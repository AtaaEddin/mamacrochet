using System.Linq.Expressions;
using System.Reflection;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace Mamacrochet.Api.QuerySpec;

/// <summary>
/// Expression-tree builder for case-insensitive ILIKE text search (D19).
/// EF Core 10 moved ILike out of the base API: the Npgsql provider ships
/// NpgsqlDbFunctionsExtensions.ILike (namespace Microsoft.EntityFrameworkCore),
/// so the pattern carries an explicit backslash escape and user input is
/// escaped before being embedded.
/// </summary>
internal static class LikeExpressions
{
    private static readonly MethodInfo _ilikeWithEscape =
        typeof(NpgsqlDbFunctionsExtensions).GetMethod(
            nameof(NpgsqlDbFunctionsExtensions.ILike),
            [typeof(DbFunctions), typeof(string), typeof(string), typeof(string)])
        ?? throw new InvalidOperationException(
            "Npgsql ILike(matchExpression, pattern, escapeCharacter) not found.");

    private static readonly PropertyInfo _efFunctions =
        typeof(EF).GetProperty(nameof(EF.Functions))!;

    /// <summary>Escape LIKE wildcards in user input (backslash escape).</summary>
    public static string Escape(string raw)
    {
        var builder = new StringBuilder(raw.Length);
        foreach (var c in raw)
        {
            if (c is '\\' or '%' or '_')
            {
                builder.Append('\\');
            }

            builder.Append(c);
        }

        return builder.ToString();
    }

    /// <summary>contains/startswith/endswith → %p% / p% / %p.</summary>
    public static string Pattern(string raw, string function)
    {
        var escaped = Escape(raw);
        return function switch
        {
            "contains" => $"%{escaped}%",
            "startswith" => $"{escaped}%",
            "endswith" => $"%{escaped}",
            _ => throw new QuerySpecException($"Unsupported text function '{function}'."),
        };
    }

    /// <summary>EF.Functions.ILike(property, pattern, '\') call expression.</summary>
    public static Expression Call(Expression property, string raw, string function)
    {
        return Expression.Call(
            _ilikeWithEscape,
            Expression.Property(null, _efFunctions),
            property,
            Expression.Constant(Pattern(raw, function)),
            Expression.Constant("\\"));
    }
}
