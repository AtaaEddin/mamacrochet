using System.Security.Claims;
using System.Text.RegularExpressions;
using Hanadicrochet.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Endpoints;

public static class CurrentUserExtensions
{
    /// <summary>The signed-in user (null when anonymous or soft-deleted).</summary>
    public static async Task<AppUser?> GetCurrentUserAsync(this AppDbContext db, ClaimsPrincipal principal)
    {
        var id = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (id is null)
        {
            return null;
        }

        return await db.Users.FirstOrDefaultAsync(u => u.Id == id && u.DeletedAt == null);
    }
}

public static class Languages
{
    public static readonly string[] All = ["en", "ar", "tr"];

    public static bool IsValid(string? language) => language is not null && All.Contains(language);
}

/// <summary>
/// What the bytes say a file is — detected from magic bytes ONLY (the
/// extension and the Content-Type header are client labels and are never
/// trusted). Signatures per the format specs; one detector serves every
/// upload path (avatars, hiring proofs, order samples, receipts, chat files)
/// and each call site keeps its own allowlist + user-facing error message.
/// </summary>
public static class FileSignatures
{
    public enum FileKind
    {
        Jpeg,
        Png,
        Webp,
        Gif,
        Pdf,
    }

    /// <summary>The set of kinds an upload path accepts (the rest is rejected).</summary>
    [Flags]
    public enum AllowedKinds
    {
        None = 0,
        Jpeg = 1 << 0,
        Png = 1 << 1,
        Webp = 1 << 2,
        Gif = 1 << 3,
        Pdf = 1 << 4,
        Images = Jpeg | Png | Webp,
        ImagesAndPdf = Images | Pdf,
        ImagesGifAndPdf = Images | Gif | Pdf,
    }

    /// <summary>Detected kind when the bytes carry a known signature, else null.</summary>
    public static FileKind? Detect(byte[] data) => Detect(data, data.Length);

    /// <summary>
    /// <see cref="Detect(byte[])"/> over a prefix of a larger buffer (streaming
    /// uploads that buffer into a pre-sized array without allocating a copy).
    /// </summary>
    public static FileKind? Detect(byte[] data, int length)
    {
        if (length >= 3
            && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF)
        {
            return FileKind.Jpeg;
        }

        // Full 8-byte PNG signature (41 50 4E 47 0D 0A 1A 0A).
        if (length >= 8
            && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47
            && data[4] == 0x0D && data[5] == 0x0A && data[6] == 0x1A && data[7] == 0x0A)
        {
            return FileKind.Png;
        }

        // WebP = RIFF container with the WEBP fourcc at offset 8.
        if (length >= 12
            && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F'
            && data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P')
        {
            return FileKind.Webp;
        }

        if (length >= 4
            && data[0] == 'G' && data[1] == 'I' && data[2] == 'F' && data[3] == '8')
        {
            return FileKind.Gif;
        }

        // PDF header at offset 0: "%PDF-" (25 50 44 46 2D). Tools that
        // generate PDFs (print-to-PDF, phone scans) always start with it.
        if (length >= 5
            && data[0] == 0x25 && data[1] == 0x50 && data[2] == 0x44 && data[3] == 0x46 && data[4] == 0x2D)
        {
            return FileKind.Pdf;
        }

        return null;
    }

    /// <summary>
    /// <see cref="Detect"/> + allowlist: null when the bytes are unknown or
    /// the kind is not accepted by this upload path.
    /// </summary>
    public static FileKind? DetectAccepted(byte[] data, AllowedKinds allowed)
        => DetectAccepted(data, data.Length, allowed);

    public static FileKind? DetectAccepted(byte[] data, int length, AllowedKinds allowed)
    {
        var kind = Detect(data, length);
        return kind is { } k && (allowed.HasFlag(FlagFor(k))) ? k : null;
    }

    public static (string Extension, string ContentType) Info(FileKind kind) => kind switch
    {
        FileKind.Jpeg => (".jpg", "image/jpeg"),
        FileKind.Png => (".png", "image/png"),
        FileKind.Webp => (".webp", "image/webp"),
        FileKind.Gif => (".gif", "image/gif"),
        FileKind.Pdf => (".pdf", "application/pdf"),
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    private static AllowedKinds FlagFor(FileKind kind) => kind switch
    {
        FileKind.Jpeg => AllowedKinds.Jpeg,
        FileKind.Png => AllowedKinds.Png,
        FileKind.Webp => AllowedKinds.Webp,
        FileKind.Gif => AllowedKinds.Gif,
        FileKind.Pdf => AllowedKinds.Pdf,
        _ => AllowedKinds.None,
    };
}

public static class AvatarImages
{
    private static readonly Regex FileNamePattern = new(
        @"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{32}\.(jpg|png|webp)$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool IsValidFileName(string fileName) => FileNamePattern.IsMatch(fileName);

    public static string ContentType(string fileName)
    {
        if (fileName.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase))
        {
            return "image/jpeg";
        }

        if (fileName.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
        {
            return "image/png";
        }

        return "image/webp";
    }
}

/// <summary>
/// Previous-work uploads (plan 09): stored as-is, no re-encoding — these
/// are proof files, not catalog images.
/// </summary>
public static class HiringFiles
{
    public const int MaxFiles = 3;
    public const long MaxBytes = 10_485_760; // 10 MB

    private static readonly Regex StoredNamePattern = new(
        @"^[0-9a-f]{32}\.(jpg|png|webp|pdf)$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool IsValidStoredName(string fileName) => StoredNamePattern.IsMatch(fileName);

    public static string ContentType(string fileName)
    {
        if (fileName.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase))
        {
            return "image/jpeg";
        }

        if (fileName.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
        {
            return "image/png";
        }

        if (fileName.EndsWith(".webp", StringComparison.OrdinalIgnoreCase))
        {
            return "image/webp";
        }

        return "application/pdf";
    }
}
