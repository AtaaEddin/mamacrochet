using Microsoft.AspNetCore.Http;

namespace Mamacrochet.Api.QuerySpec;

/// <summary>
/// OData v4.01-compatible query layer (plan 04, D19): $filter / $orderby /
/// $top / $skip. Parsed by a small hand-rolled parser and bound through a
/// per-endpoint allowlist (QueryBinder). No EDM runtime — single low-power
/// box, and the allowlist is what keeps the OData RBAC caveat manageable.
///
/// Supported $filter subset: comparisons eq/ne/lt/le/gt/ge, functions
/// contains/startswith/endswith, logical and/or/not, parentheses, and
/// string / number / boolean / null / ISO-date literals. Fields and
/// operators outside the endpoint allowlist → 400.
///
/// Sources: OData v4.01 Part 2 URL Conventions §5.1
/// (docs.oasis-open.org/odata/odata/v4.01/.../odata-v4.01-part2-url-conventions.html),
/// learn.microsoft.com/en-us/odata/concepts/queryoptions-usage.
/// </summary>
public static class QueryOptions
{
    public const int MaxFilterLength = 1000;
    public const int MaxOrderByLength = 200;
    public const int MaxExpressionDepth = 24;

    /// <summary>Parses $top/$skip/$filter/$orderby from the query string.</summary>
    public static Parsed FromQuery(IQueryCollection query, int defaultTop, int maxTop)
    {
        var top = ParseInt(query["$top"], "$top", 1, defaultTop);
        var skip = ParseInt(query["$skip"], "$skip", 0, 0);
        string? filterRaw = query["$filter"];
        string? orderByRaw = query["$orderby"];

        if (filterRaw is not null && filterRaw.Length > MaxFilterLength)
        {
            throw new QuerySpecException(
                $"$filter longer than {MaxFilterLength} characters.");
        }

        return new Parsed
        {
            Top = Math.Clamp(top, 1, maxTop),
            Skip = skip,
            Filter = filterRaw is null ? null : FilterParser.Parse(filterRaw),
            OrderBy = orderByRaw,
        };
    }

    private static int ParseInt(Microsoft.Extensions.Primitives.StringValues? raw, string name, int minimum, int fallback)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return fallback;
        }

        if (!int.TryParse(raw, out var value) || value < minimum)
        {
            throw new QuerySpecException($"{name} must be an integer >= {minimum}.");
        }

        return value;
    }
}

/// <summary>Thrown on any malformed query option → the endpoint maps it to 400.</summary>
public sealed class QuerySpecException(string message) : Exception(message);

/// <summary>Parsed query options ($top/$skip/$filter/$orderby).</summary>
public sealed class Parsed
{
    public required int Top { get; init; }
    public required int Skip { get; init; }
    public FilterNode? Filter { get; init; }
    public string? OrderBy { get; init; }
}
