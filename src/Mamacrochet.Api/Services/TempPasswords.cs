using System.Security.Cryptography;

namespace Mamacrochet.Api.Services;

/// <summary>
/// Temporary passwords for admin-created/reset users (release 1 ships no
/// email, so the admin shares them offline — plan 03). Always satisfies
/// ASP.NET Identity's default password policy (8+ chars, upper, lower,
/// digit AND a non-alphanumeric character).
/// </summary>
public static class TempPasswords
{
    private const string Lower = "abcdefghjkmnpqrstuvwxyz";
    private const string Upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
    private const string Digits = "23456789";
    private const string Symbols = "!#$%&*+?";
    private const string All = Lower + Upper + Digits + Symbols;

    public static string Generate(int length = 10)
    {
        if (length < 4)
        {
            throw new ArgumentOutOfRangeException(nameof(length));
        }

        var chars = new char[length];
        chars[0] = Pick(Lower);
        chars[1] = Pick(Upper);
        chars[2] = Pick(Digits);
        chars[3] = Pick(Symbols);
        for (var i = 4; i < length; i++)
        {
            chars[i] = Pick(All);
        }

        Shuffle(chars);
        return new string(chars);
    }

    private static char Pick(string pool)
    {
        Span<byte> bytes = stackalloc byte[1];
        RandomNumberGenerator.Fill(bytes);
        return pool[bytes[0] % pool.Length];
    }

    private static void Shuffle(char[] chars)
    {
        Span<byte> bytes = stackalloc byte[1];
        for (var i = chars.Length - 1; i > 0; i--)
        {
            RandomNumberGenerator.Fill(bytes);
            var j = bytes[0] % (i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }
    }
}
