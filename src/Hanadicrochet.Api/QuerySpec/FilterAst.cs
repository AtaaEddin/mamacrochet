namespace Hanadicrochet.Api.QuerySpec;

/// <summary>
/// Filter AST (OData v4.01 subset, plan 04 D19). Values are literals only —
/// field names are strings and resolved against the endpoint allowlist in
/// QueryBinder.
/// </summary>
public abstract record FilterValue
{
    public sealed record NullValue : FilterValue;

    public sealed record StringValue(string Value) : FilterValue;

    public sealed record NumberValue(decimal Value) : FilterValue;

    public sealed record BoolValue(bool Value) : FilterValue;

    public sealed record DateValue(DateTime Value) : FilterValue;
}

public abstract record FilterNode;

public sealed record FilterAnd(FilterNode Left, FilterNode Right) : FilterNode;

public sealed record FilterOr(FilterNode Left, FilterNode Right) : FilterNode;

public sealed record FilterNot(FilterNode Inner) : FilterNode;

/// <summary>field op literal — op ∈ eq, ne, lt, le, gt, ge.</summary>
public sealed record FilterComparison(string Field, string Op, FilterValue Value) : FilterNode;

/// <summary>fn(field, 'literal') — fn ∈ contains, startswith, endswith.</summary>
public sealed record FilterTextFunction(string Field, string Fn, FilterValue Value) : FilterNode;
