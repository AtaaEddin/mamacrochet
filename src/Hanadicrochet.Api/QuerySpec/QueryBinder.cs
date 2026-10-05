using System.Linq.Expressions;

namespace Hanadicrochet.Api.QuerySpec;

/// <summary>
/// Binds a parsed filter/order-by against an entity through an allowlist
/// (plan 04 D19). Unknown fields or unsupported operators → QuerySpecException
/// (the endpoint maps it to 400 `invalid`).
/// </summary>
public sealed class QueryBinder
{
    private sealed class FieldSpec
    {
        public required string Name { get; init; }
        public required Type Type { get; init; }
        /// <summary>Property expression for comparison operators (null for text-only fields).</summary>
        public Func<ParameterExpression, Expression>? Property { get; init; }
        /// <summary>Text search: (root, function, rawValue) → expression.</summary>
        public Func<ParameterExpression, string, string, Expression>? Text { get; init; }
        public bool TextOnly { get; init; }
        /// <summary>Orderable but not filterable (keeps the filter allowlist tight).</summary>
        public bool SortOnly { get; init; }
    }

    private readonly Dictionary<string, FieldSpec> _fields = new(StringComparer.OrdinalIgnoreCase);
    private string _defaultOrder = "id asc";

    /// <summary>
    /// The root entity type is fixed by the caller's parameter expression
    /// (the bind call takes <c>Expression&lt;Func&lt;T, bool&gt;&gt;</c>), so the
    /// binder only stores the allowlist.
    /// </summary>
    public QueryBinder()
    {
    }

    public QueryBinder Field(string name, Type type, Func<ParameterExpression, Expression> property)
    {
        _fields[name] = new FieldSpec { Name = name, Type = type, Property = property };
        return this;
    }

    /// <summary>$orderby-only field (never accepted in $filter).</summary>
    public QueryBinder SortField(string name, Type type, Func<ParameterExpression, Expression> property)
    {
        _fields[name] = new FieldSpec { Name = name, Type = type, Property = property, SortOnly = true };
        return this;
    }

    public QueryBinder TextField(string name, Func<ParameterExpression, string, string, Expression> text)
    {
        _fields[name] = new FieldSpec { Name = name, Type = typeof(string), Text = text, TextOnly = true };
        return this;
    }

    /// <summary>"field [asc|desc], …" — the default when $orderby is absent.</summary>
    public QueryBinder DefaultOrder(string orderRaw)
    {
        _defaultOrder = orderRaw;
        return this;
    }

    public Expression BuildFilter(ParameterExpression root, FilterNode node)
    {
        switch (node)
        {
            case FilterAnd andNode:
                return Expression.AndAlso(BuildFilter(root, andNode.Left), BuildFilter(root, andNode.Right));
            case FilterOr orNode:
                return Expression.OrElse(BuildFilter(root, orNode.Left), BuildFilter(root, orNode.Right));
            case FilterNot notNode:
                return Expression.Not(BuildFilter(root, notNode.Inner));
            case FilterComparison comparison:
                return BuildComparison(root, comparison);
            case FilterTextFunction function:
                return BuildTextFunction(root, function);
            default:
                throw new QuerySpecException("Unsupported filter node.");
        }
    }

    /// <summary>$orderby → the ORDER BY expression + direction.</summary>
    public (LambdaExpression Order, bool Descending) ResolveOrder(ParameterExpression root, string? orderRaw)
    {
        var raw = string.IsNullOrWhiteSpace(orderRaw) ? _defaultOrder : orderRaw!.Trim();
        if (raw.Length > QueryOptions.MaxOrderByLength)
        {
            throw new QuerySpecException(
                $"$orderby longer than {QueryOptions.MaxOrderByLength} characters.");
        }

        var first = raw.Split(',', 2)[0].Trim();
        var parts = first.Split(' ', 2, StringSplitOptions.TrimEntries);
        var name = parts[0];
        var descending = false;
        if (parts.Length == 2)
        {
            if (parts[1].Equals("asc", StringComparison.OrdinalIgnoreCase))
            {
                descending = false;
            }
            else if (parts[1].Equals("desc", StringComparison.OrdinalIgnoreCase))
            {
                descending = true;
            }
            else
            {
                throw new QuerySpecException(
                    $"$orderby direction must be 'asc' or 'desc', got '{parts[1]}'.");
            }
        }

        var field = FindField(name);
        if (field.Property is null)
        {
            throw new QuerySpecException($"Cannot sort by '{name}'.");
        }

        return (
            Expression.Lambda(field.Property(root), root),
            descending);
    }

    private FieldSpec FindField(string name)
    {
        if (!_fields.TryGetValue(name, out var field))
        {
            throw new QuerySpecException($"Unknown field '{name}'.");
        }

        return field;
    }

    private Expression BuildComparison(ParameterExpression root, FilterComparison comparison)
    {
        var field = FindField(comparison.Field);
        if (field.SortOnly)
        {
            throw new QuerySpecException($"Field '{field.Name}' cannot be filtered.");
        }

        if (field.Property is null)
        {
            throw new QuerySpecException($"Field '{field.Name}' supports text functions only.");
        }

        var property = field.Property(root);
        var operand = Coerce(field, comparison.Value);
        return comparison.Op switch
        {
            "eq" => Expression.Equal(property, operand),
            "ne" => Expression.NotEqual(property, operand),
            "lt" => Expression.LessThan(property, operand),
            "le" => Expression.LessThanOrEqual(property, operand),
            "gt" => Expression.GreaterThan(property, operand),
            "ge" => Expression.GreaterThanOrEqual(property, operand),
            _ => throw new QuerySpecException($"Unknown operator '{comparison.Op}'."),
        };
    }

    private Expression BuildTextFunction(ParameterExpression root, FilterTextFunction function)
    {
        var field = FindField(function.Field);
        if (field.Text is null)
        {
            throw new QuerySpecException(
                $"Field '{field.Name}' does not support '{function.Fn}'.");
        }

        if (function.Value is not FilterValue.StringValue value)
        {
            throw new QuerySpecException(
                $"The argument of '{function.Fn}' must be a string literal.");
        }

        return field.Text(root, function.Fn.ToLowerInvariant(), value.Value);
    }

    private static Expression Coerce(FieldSpec field, FilterValue value)
    {
        switch (field.Type)
        {
            case var type when type == typeof(string):
                return value switch
                {
                    FilterValue.StringValue s => Expression.Constant(s.Value, typeof(string)),
                    FilterValue.NullValue => Expression.Constant(null, typeof(string)),
                    _ => throw new QuerySpecException(
                        $"Field '{field.Name}' expects a string literal."),
                };

            case var type when type == typeof(decimal):
                return value switch
                {
                    // Non-nullable value type: 'field eq null' is invalid
                    // OData for these fields — 400, not an unhandled
                    // ArgumentException from Expression.Constant(null, T).
                    FilterValue.NullValue => throw NullOnNonNullable(field),
                    FilterValue.NumberValue n => Expression.Constant(n.Value, typeof(decimal)),
                    _ => throw new QuerySpecException(
                        $"Field '{field.Name}' expects a number."),
                };

            case var type when type == typeof(int):
                return value switch
                {
                    FilterValue.NullValue => throw NullOnNonNullable(field),
                    FilterValue.NumberValue n when n.Value == Math.Truncate(n.Value)
                        => Expression.Constant((int)n.Value, typeof(int)),
                    _ => throw new QuerySpecException(
                        $"Field '{field.Name}' expects a whole number."),
                };

            case var type when type == typeof(bool):
                return value switch
                {
                    FilterValue.NullValue => throw NullOnNonNullable(field),
                    FilterValue.BoolValue b => Expression.Constant(b.Value, typeof(bool)),
                    _ => throw new QuerySpecException(
                        $"Field '{field.Name}' expects true or false."),
                };

            case var type when type == typeof(DateTime):
                return value switch
                {
                    FilterValue.NullValue => throw NullOnNonNullable(field),
                    FilterValue.DateValue d => Expression.Constant(d.Value, typeof(DateTime)),
                    FilterValue.StringValue s when DateTime.TryParse(
                        s.Value,
                        System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.AssumeUniversal
                            | System.Globalization.DateTimeStyles.AdjustToUniversal,
                        out var parsed)
                        => Expression.Constant(parsed, typeof(DateTime)),
                    _ => throw new QuerySpecException(
                        $"Field '{field.Name}' expects an ISO date."),
                };

            default:
                throw new QuerySpecException($"Field '{field.Name}' has an unsupported type.");
        }
    }

    private static QuerySpecException NullOnNonNullable(FieldSpec field) =>
        new($"Field '{field.Name}' is not nullable; 'eq null' is not supported.");
}
