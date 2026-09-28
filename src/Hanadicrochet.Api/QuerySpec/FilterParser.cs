using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Hanadicrochet.Api.QuerySpec;

/// <summary>
/// Recursive-descent parser for the $filter subset (plan 04 D19).
/// Grammar (OData v4.01 Part 2, simplified):
///   filterExpr   := orExpr
///   orExpr       := andExpr ( 'or' andExpr )*
///   andExpr      := unary   ( 'and' unary )*
///   unary        := 'not' unary | primary
///   primary      := '(' filterExpr ')'
///                | field op literal | literal op field
///                | fn '(' field ',' literal ')'          (contains/startswith/endswith)
///   op           := eq | ne | lt | le | gt | ge          (case-insensitive)
///   literal      := 'string' | number | true | false | null | ISO-date
/// Operator/keyword names are case-insensitive (OData 4.01 requirement).
/// </summary>
internal static class FilterParser
{
    private static readonly Regex DatePattern = new(
        @"^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?",
        RegexOptions.Compiled);

    public static FilterNode Parse(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            throw new QuerySpecException("$filter is empty.");
        }

        var parser = new Parser(Tokenize(input));
        var node = parser.ParseFilter();
        parser.ExpectEnd();
        return node;
    }

    // ---- tokens ---------------------------------------------------------

    private enum Kind
    {
        End,
        Open,
        Close,
        Comma,
        Ident,
        String,
        Number,
        Date,
        Bool,
        Null,
    }

    private readonly record struct Token(Kind Kind, string Text)
    {
        public bool IsIdent(string name) =>
            Kind == Kind.Ident && Text.Equals(name, StringComparison.OrdinalIgnoreCase);
    }

    private static List<Token> Tokenize(string input)
    {
        var tokens = new List<Token>();
        var i = 0;
        while (i < input.Length)
        {
            var c = input[i];
            if (char.IsWhiteSpace(c))
            {
                i++;
                continue;
            }

            switch (c)
            {
                case '(':
                    tokens.Add(new Token(Kind.Open, "(")); i++; continue;
                case ')':
                    tokens.Add(new Token(Kind.Close, ")")); i++; continue;
                case ',':
                    tokens.Add(new Token(Kind.Comma, ",")); i++; continue;
                case '\'':
                {
                    var start = ++i;
                    while (i < input.Length && input[i] != '\'')
                    {
                        i++;
                    }

                    if (i >= input.Length)
                    {
                        throw new QuerySpecException("Unterminated string literal.");
                    }

                    tokens.Add(new Token(Kind.String, input[start..i]));
                    i++;
                    continue;
                }
                case '-':
                {
                    // Negative number: a '-' followed by digits is part of the
                    // literal (no arithmetic operators exist in $filter).
                    var numStart = i;
                    i++;
                    while (i < input.Length && (char.IsDigit(input[i]) || input[i] == '.'))
                    {
                        i++;
                    }

                    var numText = input[numStart..i];
                    if (numText.Length == 1
                        || !decimal.TryParse(numText, NumberStyles.Number, CultureInfo.InvariantCulture, out _))
                    {
                        throw new QuerySpecException("Invalid number literal.");
                    }

                    tokens.Add(new Token(Kind.Number, numText));
                    continue;
                }
            }

            if (char.IsDigit(c))
            {
                var dateMatch = DatePattern.Match(input, i);
                if (dateMatch.Success)
                {
                    tokens.Add(new Token(Kind.Date, dateMatch.Value));
                    i += dateMatch.Length;
                    continue;
                }

                var numberStart = i;
                while (i < input.Length && (char.IsDigit(input[i]) || input[i] == '.'))
                {
                    i++;
                }

                tokens.Add(new Token(Kind.Number, input[numberStart..i]));
                continue;
            }

            if (char.IsLetter(c))
            {
                var start = i;
                while (i < input.Length && char.IsLetterOrDigit(input[i]))
                {
                    i++;
                }

                var word = input[start..i];
                if (word.Equals("true", StringComparison.OrdinalIgnoreCase))
                {
                    tokens.Add(new Token(Kind.Bool, "true"));
                }
                else if (word.Equals("false", StringComparison.OrdinalIgnoreCase))
                {
                    tokens.Add(new Token(Kind.Bool, "false"));
                }
                else if (word.Equals("null", StringComparison.OrdinalIgnoreCase))
                {
                    tokens.Add(new Token(Kind.Null, "null"));
                }
                else
                {
                    tokens.Add(new Token(Kind.Ident, word));
                }

                continue;
            }

            throw new QuerySpecException(
                $"Unexpected character '{c}' in $filter.");
        }

        tokens.Add(new Token(Kind.End, ""));
        return tokens;
    }

    // ---- parser ---------------------------------------------------------

    private sealed class Parser(List<Token> tokens)
    {
        private int _index;
        private int _depth;

        private Token Current => tokens[_index];

        private Token Next() => tokens[_index++];

        private Token Expect(Kind kind)
        {
            var token = Next();
            if (token.Kind != kind)
            {
                throw new QuerySpecException(
                    $"Unexpected token '{token.Text}' in $filter.");
            }

            return token;
        }

        public void ExpectEnd()
        {
            if (Current.Kind != Kind.End)
            {
                throw new QuerySpecException(
                    $"Unexpected token '{Current.Text}' at the end of $filter.");
            }
        }

        public FilterNode ParseFilter() => ParseOr();

        private FilterNode ParseOr()
        {
            var left = ParseAnd();
            while (Current.IsIdent("or"))
            {
                Next();
                var right = ParseAnd();
                left = new FilterOr(left, right);
            }

            return left;
        }

        private FilterNode ParseAnd()
        {
            var left = ParseUnary();
            while (Current.IsIdent("and"))
            {
                Next();
                var right = ParseUnary();
                left = new FilterAnd(left, right);
            }

            return left;
        }

        private FilterNode ParseUnary()
        {
            if (Current.IsIdent("not"))
            {
                Next();
                return new FilterNot(ParseUnary());
            }

            return ParsePrimary();
        }

        private static readonly string[] ComparisonOps = ["eq", "ne", "lt", "le", "gt", "ge"];
        private static readonly string[] TextFunctions = ["contains", "startswith", "endswith"];

        private FilterNode ParsePrimary()
        {
            if (Current.Kind == Kind.Open)
            {
                if (++_depth > QueryOptions.MaxExpressionDepth)
                {
                    throw new QuerySpecException("Nested expressions too deep.");
                }

                Next();
                var node = ParseOr();
                Expect(Kind.Close);
                _depth--;
                return node;
            }

            var first = Current;
            if (first.Kind != Kind.Ident)
            {
                // Literal-first comparison: 'value' eq field.
                var value = ParseLiteral();
                if (Current.Kind == Kind.Ident && IsComparisonOp(Current) && Peek(1).Kind == Kind.Ident)
                {
                    var op = Next().Text.ToLowerInvariant();
                    var field = Next();
                    return new FilterComparison(field.Text, op, value);
                }

                throw new QuerySpecException(
                    $"A literal cannot stand alone in $filter.");
            }

            var name = first.Text.ToLowerInvariant();
            if (TextFunctions.Contains(name) && Peek(1).Kind == Kind.Open)
            {
                Next(); // function name
                Expect(Kind.Open);
                var field = Expect(Kind.Ident);
                Expect(Kind.Comma);
                var value = ParseLiteral();
                Expect(Kind.Close);
                return new FilterTextFunction(field.Text, name, value);
            }

            if (Peek(1).Kind == Kind.Ident
                && ComparisonOps.Contains(Peek(1).Text.ToLowerInvariant()))
            {
                var field = Next();
                var op = Next().Text.ToLowerInvariant();
                var value = ParseLiteral();
                return new FilterComparison(field.Text, op, value);
            }

            throw new QuerySpecException(
                $"Unexpected token '{first.Text}' in $filter.");
        }

        private FilterValue ParseLiteral()
        {
            var token = Next();
            return token.Kind switch
            {
                Kind.String => new FilterValue.StringValue(token.Text),
                Kind.Number => new FilterValue.NumberValue(ParseDecimal(token.Text)),
                Kind.Date => new FilterValue.DateValue(ParseDate(token.Text)),
                Kind.Bool => new FilterValue.BoolValue(token.Text.Equals("true", StringComparison.OrdinalIgnoreCase)),
                Kind.Null => new FilterValue.NullValue(),
                _ => throw new QuerySpecException(
                    $"Expected a literal, got '{token.Text}'."),
            };
        }

        private bool IsComparisonOp(Token token) =>
            token.Kind == Kind.Ident && ComparisonOps.Contains(token.Text.ToLowerInvariant());

        private Token Peek(int offset)
        {
            var index = _index + offset;
            return index < tokens.Count ? tokens[index] : tokens[^1];
        }

        private static decimal ParseDecimal(string text)
        {
            if (!decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var value))
            {
                throw new QuerySpecException($"Invalid number literal '{text}'.");
            }

            return value;
        }

        private static DateTime ParseDate(string text)
        {
            if (!DateTime.TryParse(
                    text,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                    out var value))
            {
                throw new QuerySpecException($"Invalid date literal '{text}'.");
            }

            return value;
        }
    }
}
