using Hanadicrochet.Api.Endpoints;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Magic-byte detection (pure): the API never trusts client labels — the
/// bytes decide the kind, the allowlist decides acceptance.
/// </summary>
public class FileSignaturesTests
{
    [Theory]
    [InlineData("Png")]
    [InlineData("Jpeg")]
    [InlineData("Gif")]
    [InlineData("WebP")]
    [InlineData("Pdf")]
    public void Detect_RecognizesRealFixtures(string fixture)
    {
        var bytes = fixture switch
        {
            "Png" => FileFixtures.Png,
            "Jpeg" => FileFixtures.Jpeg,
            "Gif" => FileFixtures.Gif,
            "WebP" => FileFixtures.WebP,
            _ => FileFixtures.Pdf,
        };
        var kind = FileSignatures.Detect(bytes);
        var expected = fixture switch
        {
            "Png" => FileSignatures.FileKind.Png,
            "Jpeg" => FileSignatures.FileKind.Jpeg,
            "Gif" => FileSignatures.FileKind.Gif,
            "WebP" => FileSignatures.FileKind.Webp,
            _ => FileSignatures.FileKind.Pdf,
        };
        Assert.Equal(expected, kind);
    }

    [Theory]
    [InlineData("")]
    [InlineData("plain text file, not an image or pdf")]
    public void Detect_RejectsUnknownBytes(string text)
    {
        Assert.Null(FileSignatures.Detect(System.Text.Encoding.UTF8.GetBytes(text)));
    }

    [Fact]
    public void Detect_UsesOnlyThePrefixLength()
    {
        // Streaming path: a pre-sized buffer, only the first N bytes count.
        var buffer = new byte[FileFixtures.Png.Length + 100];
        FileFixtures.Png.CopyTo(buffer, 0);
        Assert.Equal(FileSignatures.FileKind.Png, FileSignatures.Detect(buffer, FileFixtures.Png.Length));
        // A PDF header (only 12 bytes present) is still detected as PDF.
        var shortPdf = new byte[12];
        FileFixtures.Pdf.AsSpan(0, 12).CopyTo(shortPdf);
        Assert.Equal(FileSignatures.FileKind.Pdf, FileSignatures.Detect(shortPdf, 12));
    }

    [Fact]
    public void DetectAccepted_FiltersByAllowlist()
    {
        Assert.Null(FileSignatures.DetectAccepted(FileFixtures.Pdf, FileSignatures.AllowedKinds.Images));
        Assert.Equal(
            FileSignatures.FileKind.Pdf,
            FileSignatures.DetectAccepted(FileFixtures.Pdf, FileSignatures.AllowedKinds.ImagesAndPdf));
        Assert.Null(FileSignatures.DetectAccepted(FileFixtures.PlainText, FileSignatures.AllowedKinds.ImagesGifAndPdf));
        Assert.Equal(
            FileSignatures.FileKind.Png,
            FileSignatures.DetectAccepted(FileFixtures.Png, FileSignatures.AllowedKinds.ImagesGifAndPdf));
    }

    [Theory]
    [InlineData("Jpeg", ".jpg", "image/jpeg")]
    [InlineData("Png", ".png", "image/png")]
    [InlineData("Webp", ".webp", "image/webp")]
    [InlineData("Gif", ".gif", "image/gif")]
    [InlineData("Pdf", ".pdf", "application/pdf")]
    public void Info_GivesExtensionAndContentType(string kind, string ext, string contentType)
    {
        var (e, c) = FileSignatures.Info(Enum.Parse<FileSignatures.FileKind>(kind, true));
        Assert.Equal(ext, e);
        Assert.Equal(contentType, c);
    }
}
