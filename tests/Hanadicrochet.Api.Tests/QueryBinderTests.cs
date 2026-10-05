using System.Linq.Expressions;
using Hanadicrochet.Api.QuerySpec;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// QueryBinder unit tests (plan 20261005-1348/01): allowlist binding,
/// literal coercion per field type, text-function routing, sort-only
/// fields, $orderby resolution. Expressions are compiled and evaluated
/// against in-memory probe instances (no EF, no DB).
/// </summary>
public class QueryBinderTests
{
    private sealed class Probe
    {
        public string? Name { get; set; }
        public decimal Price { get; set; }
        public int Units { get; set; }
        public bool Visible { get; set; }
        public DateTime CreatedAt { get; set; }
        public string? Title { get; set; }
        public string? Code { get; set; }
    }

    private static ParameterExpression Root() => Expression.Parameter(typeof(Probe), "p");

    private static Expression Prop(ParameterExpression p, string name) =>
        Expression.Property(p, name);

    /// <summary>Full allowlist: one field per supported type + text + sort-only.</summary>
    private static QueryBinder Binder() => new QueryBinder()
        .Field("name", typeof(string), p => Prop(p, nameof(Probe.Name)))
        .Field("price", typeof(decimal), p => Prop(p, nameof(Probe.Price)))
        .Field("units", typeof(int), p => Prop(p, nameof(Probe.Units)))
        .Field("visible", typeof(bool), p => Prop(p, nameof(Probe.Visible)))
        .Field("createdAt", typeof(DateTime), p => Prop(p, nameof(Probe.CreatedAt)))
        .TextField("title", (root, fn, raw) =>
            LikeExpressions.Call(Prop(root, nameof(Probe.Title)), raw, fn))
        .SortField("code", typeof(string), p => Prop(p, nameof(Probe.Code)))
        .DefaultOrder("createdAt desc");

    private static Probe NewProbe(string? name = "Hanadi", decimal price = 19m,
        int units = 2, bool visible = true,
        DateTime? createdAt = null, string? title = "Cozy tote", string? code = "A")
        => new()
        {
            Name = name,
            Price = price,
            Units = units,
            Visible = visible,
            CreatedAt = createdAt ?? new DateTime(2026, 10, 5, 12, 0, 0, DateTimeKind.Utc),
            Title = title,
            Code = code,
        };

    private static Func<Probe, bool> Compile(QueryBinder binder, string filter)
    {
        var root = Root();
        var body = binder.BuildFilter(root, FilterParser.Parse(filter));
        return Expression.Lambda<Func<Probe, bool>>(body, root).Compile();
    }

    // ---- comparison coercion per field type -------------------------------

    [Theory]
    [InlineData("name eq 'Hanadi'", true)]
    [InlineData("name ne 'Hanadi'", false)]
    [InlineData("name eq null", false)]
    public void StringField(string filter, bool expected)
        => Assert.Equal(expected, Compile(Binder(), filter)(NewProbe()));

    [Theory]
    [InlineData("price eq 19", true)]
    [InlineData("price ne 19", false)]
    [InlineData("price lt 20", true)]
    [InlineData("price le 19", true)]
    [InlineData("price gt 18", true)]
    [InlineData("price ge 20", false)]
    public void DecimalField(string filter, bool expected)
        => Assert.Equal(expected, Compile(Binder(), filter)(NewProbe()));

    [Theory]
    [InlineData("units eq 2", true)]
    [InlineData("units gt 2", false)]
    [InlineData("units lt 2", false)]
    [InlineData("units ne 2", false)]
    public void IntField(string filter, bool expected)
        => Assert.Equal(expected, Compile(Binder(), filter)(NewProbe()));

    [Theory]
    [InlineData("visible eq true", true)]
    [InlineData("visible eq false", false)]
    [InlineData("visible ne true", false)]
    public void BoolField(string filter, bool expected)
        => Assert.Equal(expected, Compile(Binder(), filter)(NewProbe()));

    [Theory]
    [InlineData("createdAt eq 2026-10-05T12:00:00Z", true)]
    [InlineData("createdAt gt 2026-10-05T12:00:00Z", false)]
    [InlineData("createdAt lt 2026-10-06T00:00:00Z", true)]
    [InlineData("createdAt ge 2026-10-05T12:00:00Z", true)]
    [InlineData("createdAt ne 2026-10-05T12:00:00Z", false)]
    public void DateTimeField_DateLiteral(string filter, bool expected)
        => Assert.Equal(expected, Compile(Binder(), filter)(NewProbe()));

    [Fact]
    public void DateTimeField_StringLiteral_IsParsed()
    {
        // A quoted ISO date also coerces (Coerce has a string branch).
        var filter = "createdAt gt '2026-10-05T12:00:00Z'";
        Assert.False(Compile(Binder(), filter)(NewProbe()));
    }

    [Theory]
    [InlineData("name eq 5", "string literal")]
    [InlineData("name eq true", "string literal")]
    [InlineData("name eq 2026-10-05", "string literal")]
    [InlineData("price eq null", "not nullable")]
    [InlineData("units eq null", "not nullable")]
    [InlineData("visible eq null", "not nullable")]
    [InlineData("createdAt eq null", "not nullable")]
    [InlineData("price eq 'x'", "number")]
    [InlineData("price eq true", "number")]
    [InlineData("units eq 1.5", "whole number")]
    [InlineData("units eq 'x'", "whole number")]
    [InlineData("visible eq 'x'", "true or false")]
    [InlineData("createdAt eq 'not-a-date'", "ISO date")]
    [InlineData("createdAt eq 5", "ISO date")]
    public void Coercion_MismatchesThrow(string filter, string messagePart)
    {
        var ex = Assert.Throws<QuerySpecException>(() => Compile(Binder(), filter));
        Assert.Contains(messagePart, ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ---- logical composition -----------------------------------------------

    [Theory]
    [InlineData("name eq 'Hanadi' and price lt 20", true)]
    [InlineData("name eq 'Hanadi' and price gt 100", false)]
    [InlineData("name eq 'Nope' or price lt 20", true)]
    [InlineData("name eq 'Nope' or price gt 100", false)]
    [InlineData("not name eq 'Hanadi'", false)]
    [InlineData("not (name eq 'Hanadi' and price gt 100)", true)]
    [InlineData("(name eq 'Hanadi' or name eq 'Nope') and price le 19", true)]
    public void LogicalCombinations(string filter, bool expected)
        => Assert.Equal(expected, Compile(Binder(), filter)(NewProbe()));

    // ---- text functions ------------------------------------------------------

    [Theory]
    [InlineData("contains(title, 'tote')")]
    [InlineData("startswith(title, 'Cozy')")]
    [InlineData("endswith(title, 'tote')")]
    public void TextField_BuildsIlLikeCall(string filter)
    {
        var root = Root();
        var body = Binder().BuildFilter(root, FilterParser.Parse(filter));

        // The tree root is the ILike call itself; verify method + pattern
        // (Call node types are internal in .NET 10 — use NodeType + ToString).
        Assert.Equal(ExpressionType.Call, body.NodeType);
        var text = body.ToString();
        Assert.Contains("ILike", text);
        Assert.Contains("%", text);
    }

    [Theory]
    [InlineData("title eq 'x'", "text functions only")]
    [InlineData("title ne 'x'", "text functions only")]
    [InlineData("contains(title, 5)", "string literal")]
    [InlineData("contains(name, 'a')", "does not support")]
    public void TextField_Errors(string filter, string messagePart)
    {
        var ex = Assert.Throws<QuerySpecException>(() => Compile(Binder(), filter));
        Assert.Contains(messagePart, ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ---- sort-only fields + unknown fields -----------------------------------

    [Theory]
    [InlineData("code eq 'A'")]
    [InlineData("code gt 'A'")]
    public void SortOnlyField_CannotBeFiltered(string filter)
    {
        var ex = Assert.Throws<QuerySpecException>(() => Compile(Binder(), filter));
        Assert.Contains("cannot be filtered", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void UnknownField_Throws()
    {
        var ex = Assert.Throws<QuerySpecException>(
            () => Compile(Binder(), "missing eq 'x'"));
        Assert.Contains("Unknown field 'missing'", ex.Message);
    }

    [Fact]
    public void FieldLookup_IsCaseInsensitive()
    {
        Assert.True(Compile(Binder(), "NAME eq 'Hanadi'")(NewProbe()));
    }

    // ---- $orderby -------------------------------------------------------------

    private static (object? Value, bool Descending) Resolve(
        QueryBinder binder, string? orderRaw)
    {
        var (lambda, descending) = binder.ResolveOrder(Root(), orderRaw);
        var value = lambda.Compile().DynamicInvoke(NewProbe());
        return (value, descending);
    }

    [Theory]
    [InlineData("price desc", true, "19")]
    [InlineData("name ASC", false, "Hanadi")]
    [InlineData("code desc", true, "A")]
    [InlineData("code, name desc", false, "A")]
    [InlineData("  price   desc  ", true, "19")]
    public void ResolveOrder_Valid(string? orderRaw, bool expectedDesc, string expectedValue)
    {
        var (value, descending) = Resolve(Binder(), orderRaw);
        Assert.Equal(expectedDesc, descending);
        Assert.Equal(expectedValue, Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture));
    }

    [Theory]
    [InlineData("price sideways", "asc' or 'desc")]
    [InlineData("missing asc", "Unknown field")]
    [InlineData("title asc", "Cannot sort")]
    public void ResolveOrder_Errors(string orderRaw, string messagePart)
    {
        var ex = Assert.Throws<QuerySpecException>(() => Resolve(Binder(), orderRaw));
        Assert.Contains(messagePart, ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ResolveOrder_MaxLength()
    {
        var order = "price " + new string('x', QueryOptions.MaxOrderByLength);
        var ex = Assert.Throws<QuerySpecException>(() => Resolve(Binder(), order));
        Assert.Contains("longer than", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void DefaultOrder_IsUsedWhenOrderRawIsBlank()
    {
        var (value, descending) = Resolve(Binder(), "   ");
        Assert.True(descending); // "createdAt desc"
        Assert.Equal(new DateTime(2026, 10, 5, 12, 0, 0, DateTimeKind.Utc), value);
    }
}
