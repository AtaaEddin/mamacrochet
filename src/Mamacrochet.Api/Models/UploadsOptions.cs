namespace Mamacrochet.Api.Models;

public sealed class UploadsOptions
{
    public const string SectionName = "Uploads";

    /// <summary>Absolute root of user-uploaded files (product images, receipts,
    /// avatars, samples). Prod: a Docker volume mount (plan 10).</summary>
    public string Root { get; set; } = Path.Combine(Directory.GetCurrentDirectory(), "uploads");
}
