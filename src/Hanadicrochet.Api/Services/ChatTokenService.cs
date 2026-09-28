using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Hanadicrochet.Api.Services;

/// <summary>
/// Chat token options (plan 06, D24/D25). <see cref="TokenKey"/> is the
/// HMAC key for guest thread tokens and chat file signatures: base64 of 32
/// or more bytes, set in the prod .env. Unset (dev), a per-process ephemeral
/// key is generated — tokens and signatures die with the process, which is
/// fine for single-instance dev.
/// </summary>
public sealed class ChatTokenOptions
{
    public const string SectionName = "Chat";

    public string? TokenKey { get; set; }

    /// <summary>Guest thread token lifetime. The client re-bootstraps on demand.</summary>
    public TimeSpan TokenLifetime { get; set; } = TimeSpan.FromHours(2);

    /// <summary>Chat file read-signature lifetime (embedded in message DTOs).</summary>
    public TimeSpan FileSignatureLifetime { get; set; } = TimeSpan.FromHours(1);
}

/// <summary>
/// Stateless HMAC tokens for anonymous (visitor) chat access (plan 06, D24):
/// <c>base64url(payload).base64url(hmacSha256(key, payload))</c> where the
/// payload is <c>{threadId, guestId, exp}</c>. Bound to BOTH the thread and
/// the device; verified in constant time. No table, no Redis (D9).
/// </summary>
public sealed class ChatTokenService
{
    private const int MinKeyBytes = 32;

    private readonly byte[] _key;
    private readonly ChatTokenOptions _options;
    private readonly ILogger<ChatTokenService> _logger;

    public ChatTokenService(
        IOptions<ChatTokenOptions> options,
        ILogger<ChatTokenService> logger)
    {
        _options = options.Value;
        _logger = logger;
        var configured = _options.TokenKey;
        if (configured is not null)
        {
            byte[] decoded;
            try
            {
                decoded = Convert.FromBase64String(configured);
            }
            catch (FormatException)
            {
                throw new InvalidOperationException(
                    "Chat:TokenKey must be base64 (32+ bytes).");
            }

            if (decoded.Length < MinKeyBytes)
            {
                throw new InvalidOperationException(
                    $"Chat:TokenKey must decode to at least {MinKeyBytes} bytes.");
            }

            _key = decoded;
        }
        else
        {
            _key = RandomNumberGenerator.GetBytes(MinKeyBytes);
            _logger.LogWarning(
                "Chat:TokenKey is not set — using an ephemeral per-process key " +
                "(guest tokens/signatures are invalidated on every restart).");
        }
    }

    /// <summary>A guest thread token for (threadId, guestId), valid for the configured lifetime.</summary>
    public string CreateThreadToken(string threadId, string guestId)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            threadId,
            guestId,
            exp = DateTimeOffset.UtcNow.Add(_options.TokenLifetime).ToUnixTimeSeconds(),
        });
        return Encode(payload);
    }

    /// <summary>
    /// Validates a guest thread token. Returns (threadId, guestId) when the
    /// signature is intact and the token is unexpired, else null.
    /// </summary>
    public (string ThreadId, string GuestId)? TryValidateThreadToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        var parts = token.Split('.');
        if (parts.Length != 2)
        {
            return null;
        }

        byte[] payload, mac;
        try
        {
            payload = FromBase64Url(parts[0]);
            mac = FromBase64Url(parts[1]);
        }
        catch (FormatException)
        {
            return null;
        }

        var expected = HmacSha256(payload);
        if (!CryptographicOperations.FixedTimeEquals(expected, mac))
        {
            return null;
        }

        try
        {
            var doc = JsonDocument.Parse(payload);
            var root = doc.RootElement;
            var threadId = root.TryGetProperty("threadId", out var t) ? t.GetString() : null;
            var guestId = root.TryGetProperty("guestId", out var g) ? g.GetString() : null;
            var exp = root.TryGetProperty("exp", out var e) ? e.GetInt64() : 0;
            if (string.IsNullOrEmpty(threadId) || string.IsNullOrEmpty(guestId))
            {
                return null;
            }

            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp)
            {
                return null;
            }

            return (threadId, guestId);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// A read-only signature for one chat file (D25): scoped to exactly this
    /// thread + file, valid for the configured lifetime. Served at
    /// /files/chat/{threadId}/{fileName}?sig=..&exp=..
    /// </summary>
    public (long Exp, string Sig) CreateFileSignature(string threadId, string fileName)
    {
        var exp = DateTimeOffset.UtcNow
            .Add(_options.FileSignatureLifetime)
            .ToUnixTimeSeconds();
        var payload = $"{threadId}/{fileName}|{exp}";
        return (exp, Base64Url(HmacSha256(Encoding.UTF8.GetBytes(payload))));
    }

    public bool VerifyFileSignature(
        string threadId, string fileName, string? sig, long? exp)
    {
        if (string.IsNullOrEmpty(sig) || exp is null)
        {
            return false;
        }

        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp.Value)
        {
            return false;
        }

        var payload = $"{threadId}/{fileName}|{exp.Value}";
        var expected = Base64Url(HmacSha256(Encoding.UTF8.GetBytes(payload)));
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(sig));
    }

    private string Encode(byte[] payload) =>
        $"{Base64Url(payload)}.{Base64Url(HmacSha256(payload))}";

    private byte[] HmacSha256(byte[] data)
    {
        using var hmac = new HMACSHA256(_key);
        return hmac.ComputeHash(data);
    }

    private static string Base64Url(byte[] data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>
    /// Base64url without padding → bytes (Convert.FromBase64String in
    /// .NET 10 rejects missing padding, so restore it first).
    /// </summary>
    private static byte[] FromBase64Url(string value)
    {
        var standard = value.Replace('-', '+').Replace('_', '/');
        standard += new string('=', (4 - standard.Length % 4) % 4);
        return Convert.FromBase64String(standard);
    }
}
