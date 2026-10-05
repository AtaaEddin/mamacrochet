using System.Linq.Expressions;
using System.Reflection;
using Hanadicrochet.Api.QuerySpec;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// LikeExpressions (ILIKE pattern building) + QueryOptions.FromQuery
/// (plan 20261005-1348/01). Pure logic — no EF execution.
/// </summary>
public class QuerySpecMiscTests
{
    // ---- LikeExpressions.Escape -------------------------------------------

    [Theory]
    [InlineData("plain", "plain")]
    [InlineData("100%", "100\\%")]
    [InlineData("a_b", "a\\_b")]
    [InlineData("a\\b", "a\\\\b")]
    [InlineData("%_\\x", "\\%\\_\\\\x")]
    public void Escape_Wildcards(string raw, string expected)
        => Assert.Equal(expected, LikeExpressions.Escape(raw));

    // ---- LikeExpressions.Pattern -------------------------------------------

    [Theory]
    [InlineData("tote", "contains", "%tote%")]
    [InlineData("tote", "startswith", "tote%")]
    [InlineData("tote", "endswith", "%tote")]
    [InlineData("100%", "contains", "%100\\%%")]
    [InlineData("a_b", "startswith", "a\\_b%")]
    public void Pattern_Shapes(string raw, string fn, string expected)
        => Assert.Equal(expected, LikeExpressions.Pattern(raw, fn));

    [Fact]
    public void Pattern_UnknownFunction()
    {
        var ex = Assert.Throws<QuerySpecException>(
            () => LikeExpressions.Pattern("x", "ilike"));
        Assert.Contains("Unsupported text function", ex.Message);
    }

    // ---- LikeExpressions.Call -----------------------------------------------

    [Fact]
    public void Call_BuildsIlLikeWithEscapedPatternAndBackslash()
    {
        var prop = Expression.Constant("value", typeof(string));
        var call = LikeExpressions.Call(prop, "a%b", "contains");

        // The call node's runtime type is internal in .NET 10 — inspect via
        // NodeType + the node's public members reflectively.
        Assert.Equal(ExpressionType.Call, call.NodeType);
        var type = call.GetType();
        var method = (MethodInfo)type.GetProperty("Method")!.GetValue(call)!;
        var arguments = (System.Collections.ObjectModel.ReadOnlyCollection<Expression>)
            type.GetProperty("Arguments")!.GetValue(call)!;

        Assert.Equal("ILike", method.Name);
        Assert.True(method.IsStatic); // extension method on NpgsqlDbFunctionsExtensions
        Assert.Contains("EF.Functions.ILike", call.ToString());
        // .NET 10 node layout: Arguments = [instance, property, pattern, escape].
        Assert.Contains("EF.Functions", arguments[0].ToString());
        Assert.Same(prop, arguments[1]);
        // Constant node type is internal too — its public Value member via reflection.
        Assert.Equal("%a\\%b%", ConstValue(arguments[2]));
        Assert.Equal("\\", ConstValue(arguments[3]));
    }

    private static object? ConstValue(Expression constant) =>
        constant.GetType().GetProperty("Value")!.GetValue(constant);

    // ---- QueryOptions.FromQuery ---------------------------------------------

    private static QueryCollection Q(params (string Key, string Value)[] pairs) =>
        new(pairs.ToDictionary(p => p.Key, p => new StringValues(p.Value)));

    [Fact]
    public void FromQuery_Defaults()
    {
        var parsed = QueryOptions.FromQuery(Q(), defaultTop: 20, maxTop: 96);
        Assert.Equal(20, parsed.Top);
        Assert.Equal(0, parsed.Skip);
        Assert.Null(parsed.Filter);
        Assert.Null(parsed.OrderBy);
    }

    [Fact]
    public void FromQuery_TopClamped()
    {
        Assert.Equal(96, QueryOptions.FromQuery(Q(("$top", "500")), 20, 96).Top);
        Assert.Equal(1, QueryOptions.FromQuery(Q(("$top", "1")), 20, 96).Top);
    }

    [Fact]
    public void FromQuery_SkipAndOrderBy()
    {
        var parsed = QueryOptions.FromQuery(Q(
            ("$skip", "40"), ("$orderby", "price desc")), 20, 96);
        Assert.Equal(40, parsed.Skip);
        Assert.Equal("price desc", parsed.OrderBy);
    }

    [Fact]
    public void FromQuery_FilterIsParsed()
    {
        var parsed = QueryOptions.FromQuery(Q(("$filter", "price gt 5")), 20, 96);
        var comparison = Assert.IsType<FilterComparison>(parsed.Filter);
        Assert.Equal("price", comparison.Field);
    }

    [Theory]
    [InlineData("$top", "abc")]
    [InlineData("$top", "0")]
    [InlineData("$top", "-5")]
    [InlineData("$skip", "abc")]
    [InlineData("$skip", "-1")]
    public void FromQuery_BadIntegers(string key, string value)
    {
        var ex = Assert.Throws<QuerySpecException>(
            () => QueryOptions.FromQuery(Q((key, value)), 20, 96));
        Assert.Contains(key, ex.Message);
    }

    [Fact]
    public void FromQuery_FilterLengthLimit()
    {
        var filter = new string('a', QueryOptions.MaxFilterLength + 1);
        var ex = Assert.Throws<QuerySpecException>(
            () => QueryOptions.FromQuery(Q(("$filter", filter)), 20, 96));
        Assert.Contains("longer than", ex.Message, StringComparison.OrdinalIgnoreCase);
    }
}


