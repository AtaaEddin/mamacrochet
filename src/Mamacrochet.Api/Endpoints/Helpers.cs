using System.Security.Claims;
using System.Text.RegularExpressions;
using Mamacrochet.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Mamacrochet.Api.Endpoints;

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

public static class AvatarImages
{
    private static readonly Regex FileNamePattern = new(
        @"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{32}\.(jpg|png|webp)$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool IsValidFileName(string fileName) => FileNamePattern.IsMatch(fileName);

    public static string? DetectExtension(byte[] data)
    {
        if (data.Length > 2 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF)
        {
            return ".jpg";
        }

        if (data.Length > 4 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47)
        {
            return ".png";
        }

        if (data.Length > 12
            && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F'
            && data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P')
        {
            return ".webp";
        }

        return null;
    }

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
/// Previous-work uploads (plan 09): image or PDF, validated by magic bytes
/// only — the extension and the Content-Type header are client labels and are
/// never trusted. Same hand-rolled approach as <see cref="AvatarImages"/>;
/// signatures per the format specs (PDF header "%PDF-" = 25 50 44 46 2D).
/// No re-encoding: these are proof files, not catalog images.
/// </summary>
public static class HiringFiles
{
    public const int MaxFiles = 3;
    public const long MaxBytes = 10_485_760; // 10 MB

    private static readonly Regex StoredNamePattern = new(
        @"^[0-9a-f]{32}\.(jpg|png|webp|pdf)$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool IsValidStoredName(string fileName) => StoredNamePattern.IsMatch(fileName);

    public static string? DetectExtension(byte[] data)
    {
        if (data.Length > 2 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF)
        {
            return ".jpg";
        }

        if (data.Length > 4 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47)
        {
            return ".png";
        }

        if (data.Length > 12
            && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F'
            && data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P')
        {
            return ".webp";
        }

        // Strict header at offset 0: tools that generate PDFs (print-to-PDF,
        // phone scans) always start with the signature.
        if (data.Length > 5
            && data[0] == 0x25 && data[1] == 0x50 && data[2] == 0x44 && data[3] == 0x46 && data[4] == 0x2D)
        {
            return ".pdf";
        }

        return null;
    }

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
