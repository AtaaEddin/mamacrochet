using Hanadicrochet.Api.QuerySpec;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// FilterParser unit tests (plan 20261005-1348/01): the $filter subset
/// grammar — operators, literals, functions, precedence, depth, errors.
/// Pure parsing: no DB, no EF.
/// </summary>
public class FilterParserTests
{
    // ---- comparisons ----------------------------------------------------

    [Theory]
    [InlineData("name eq 'Hanadi'")]
    [InlineData("name ne 'Hanadi'")]
    [InlineData("price lt 100")]
    [InlineData("price le 100")]
    [InlineData("price gt 100")]
    [InlineData("price ge 100")]
    public void Comparison_AllSixOperators(string input)
    {
        var node = Assert.IsType<FilterComparison>(FilterParser.Parse(input));
        Assert.Equal(input.Split(' ')[1], node.Op);
    }

    [Fact]
    public void Comparison_OperatorNamesAreCaseInsensitive()
    {
        var node = Assert.IsType<FilterComparison>(FilterParser.Parse("NAME EQ 'x'"));
        Assert.Equal("eq", node.Op);
        // Field text keeps the original spelling (the binder lower-cases
        // its allowlist lookup itself).
        Assert.Equal("NAME", node.Field);

        var lower = Assert.IsType<FilterComparison>(FilterParser.Parse("name Eq 'x'"));
        Assert.Equal("Eq".ToLowerInvariant(), lower.Op);
    }

    [Theory]
    [InlineData("'Hanadi' eq name")]
    [InlineData("5 gt units")]
    [InlineData("true eq visible")]
    [InlineData("null ne name")]
    public void LiteralFirstComparisons(string input)
    {
        var node = Assert.IsType<FilterComparison>(FilterParser.Parse(input));
        Assert.NotNull(node.Value);
    }

    [Fact]
    public void Comparison_NumberLiteral()
    {
        var node = Assert.IsType<FilterComparison>(FilterParser.Parse("price eq 19.5"));
        Assert.Equal(new FilterValue.NumberValue(19.5m), node.Value);
    }

    [Fact]
    public void Comparison_NegativeNumberLiteral()
    {
        var node = Assert.IsType<FilterComparison>(FilterParser.Parse("price eq -19.5"));
        Assert.Equal(new FilterValue.NumberValue(-19.5m), node.Value);
    }

    [Fact]
    public void Comparison_BoolAndNullLiterals()
    {
        var t = Assert.IsType<FilterComparison>(FilterParser.Parse("visible eq true"));
        Assert.Equal(new FilterValue.BoolValue(true), t.Value);

        var f = Assert.IsType<FilterComparison>(FilterParser.Parse("visible eq FALSE"));
        Assert.Equal(new FilterValue.BoolValue(false), f.Value);

        var n = Assert.IsType<FilterComparison>(FilterParser.Parse("name eq null"));
        Assert.Equal(new FilterValue.NullValue(), n.Value);
    }

    [Theory]
    [InlineData("createdAt ge 2026-10-05")]
    [InlineData("createdAt le 2026-10-05 13:48")]
    [InlineData("createdAt eq 2026-10-05T13:48:00")]
    [InlineData("createdAt eq 2026-10-05T13:48:00.123Z")]
    [InlineData("createdAt lt 2026-10-05T00:00:00+03:00")]
    public void Comparison_IsoDateLiterals(string input)
    {
        var node = Assert.IsType<FilterComparison>(FilterParser.Parse(input));
        var value = Assert.IsType<FilterValue.DateValue>(node.Value);
        Assert.Equal(DateTimeKind.Utc, value.Value.Kind);
        Assert.Equal(2026, value.Value.Year);
    }

    // ---- text functions ---------------------------------------------------

    [Theory]
    [InlineData("contains(title, 'tote')")]
    [InlineData("startswith(title, 'ha')")]
    [InlineData("endswith(title, 'bag')")]
    [InlineData("CONTAINS(title, 'tote')")]
    public void TextFunctions(string input)
    {
        var node = Assert.IsType<FilterTextFunction>(FilterParser.Parse(input));
        Assert.Equal("title", node.Field);
        Assert.IsType<FilterValue.StringValue>(node.Value);
    }

    [Theory]
    [InlineData("contains(title, 5)")]
    [InlineData("contains(title, null)")]
    [InlineData("contains(title, true)")]
    public void TextFunctions_NonStringArgument(string input)
    {
        // The parser only enforces the shape (fn, field, literal); the
        // binder rejects non-string arguments — parse must still succeed.
        var node = Assert.IsType<FilterTextFunction>(FilterParser.Parse(input));
        Assert.NotEqual(typeof(FilterValue.StringValue), node.Value.GetType());
    }

    // ---- logical operators ------------------------------------------------

    [Fact]
    public void AndOr_NotPrecedence()
    {
        // a or b and c  →  a or (b and c) — and binds tighter than or.
        var node = Assert.IsType<FilterOr>(
            FilterParser.Parse("a eq 1 or b eq 2 and c eq 3"));
        var right = Assert.IsType<FilterAnd>(node.Right);
        Assert.Equal("a", ((FilterComparison)node.Left).Field);
        Assert.Equal("b", ((FilterComparison)right.Left).Field);
        Assert.Equal("c", ((FilterComparison)right.Right).Field);
    }

    [Fact]
    public void ParenthesesOverridePrecedence()
    {
        var node = Assert.IsType<FilterAnd>(
            FilterParser.Parse("(a eq 1 or b eq 2) and c eq 3"));
        Assert.IsType<FilterOr>(node.Left);
    }

    [Fact]
    public void Not_AppliesToNextUnary()
    {
        var node = Assert.IsType<FilterNot>(FilterParser.Parse("not a eq 1"));
        Assert.IsType<FilterComparison>(node.Inner);

        var doubleNegation = Assert.IsType<FilterNot>(FilterParser.Parse("not not a eq 1"));
        Assert.IsType<FilterNot>(doubleNegation.Inner);
    }

    [Fact]
    public void NestedParentheses_UntoDepthLimit()
    {
        // 24 deep parses (the limit), 25 deep throws.
        var ok = new string('(', 24) + "a eq 1" + new string(')', 24);
        Assert.IsType<FilterComparison>(FilterParser.Parse(ok));

        var tooDeep = new string('(', 25) + "a eq 1" + new string(')', 25);
        var ex = Assert.Throws<QuerySpecException>(() => FilterParser.Parse(tooDeep));
        Assert.Contains("too deep", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ---- error paths --------------------------------------------------------

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public void EmptyInput(string input)
    {
        Assert.Throws<QuerySpecException>(() => FilterParser.Parse(input));
    }

    [Theory]
    [InlineData("'unterminated")]
    [InlineData("name eq 'a")]
    public void UnterminatedString(string input)
    {
        var ex = Assert.Throws<QuerySpecException>(() => FilterParser.Parse(input));
        Assert.Contains("Unterminated", ex.Message);
    }

    [Theory]
    [InlineData("-")]
    [InlineData("name eq -")]
    [InlineData("name eq -x")]
    public void InvalidNumberLiteral(string input)
    {
        var ex = Assert.Throws<QuerySpecException>(() => FilterParser.Parse(input));
        Assert.Contains("number", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("name = 'x'")]
    [InlineData("name eq \"x\"")]
    [InlineData("name eq 'x' |")]
    [InlineData("$filter")]
    public void UnexpectedCharacter(string input)
    {
        var ex = Assert.Throws<QuerySpecException>(() => FilterParser.Parse(input));
        Assert.Contains("Unexpected character", ex.Message);
    }

    [Theory]
    [InlineData("'lone'")]
    [InlineData("5")]
    [InlineData("true")]
    [InlineData("2026-10-05")]
    public void LoneLiteral(string input)
    {
        var ex = Assert.Throws<QuerySpecException>(() => FilterParser.Parse(input));
        Assert.Contains("stand alone", ex.Message);
    }

    [Theory]
    [InlineData("name eq 'x' 'y'")]
    [InlineData("(a eq 1")]
    [InlineData("a eq 1)")]
    [InlineData("a eq 1 and")]
    [InlineData("or a eq 1")]
    [InlineData("and")]
    [InlineData("not")]
    [InlineData("a eq")]
    public void MalformedShape(string input)
    {
        Assert.Throws<QuerySpecException>(() => FilterParser.Parse(input));
    }
}
