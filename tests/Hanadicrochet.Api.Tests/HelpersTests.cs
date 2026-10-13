using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Endpoints;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Batch A of sub-plan 04: the small statics in Endpoints/Helpers.cs that
/// the upload pipelines share — FileSignatures.Info, AvatarImages and
/// HiringFiles name/extension rules.
/// </summary>
public class HelpersTests
{
    [Theory]
    [InlineData(FileSignatures.FileKind.Jpeg, ".jpg", "image/jpeg")]
    [InlineData(FileSignatures.FileKind.Png, ".png", "image/png")]
    [InlineData(FileSignatures.FileKind.Webp, ".webp", "image/webp")]
    [InlineData(FileSignatures.FileKind.Gif, ".gif", "image/gif")]
    [InlineData(FileSignatures.FileKind.Pdf, ".pdf", "application/pdf")]
    public void Info_GivesExtensionAndContentType(
        FileSignatures.FileKind kind, string extension, string contentType)
    {
        var (extensionActual, contentTypeActual) = FileSignatures.Info(kind);

        Assert.Equal(extension, extensionActual);
        Assert.Equal(contentType, contentTypeActual);
    }

    [Fact]
    public void Info_UnknownKind_Throws()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => FileSignatures.Info((FileSignatures.FileKind)999));
    }

    [Theory]
    [InlineData("01234567-89ab-cdef-0123-456789abcdef-0123456789abcdef0123456789abcdef.jpg", true)]
    [InlineData("01234567-89ab-cdef-0123-456789abcdef-0123456789abcdef0123456789abcdef.PNG", true)]
    [InlineData("01234567-89ab-cdef-0123-456789abcdef-0123456789abcdef0123456789abcdef.webp", true)]
    [InlineData("01234567-89ab-cdef-0123-456789abcdef-0123456789abcdef0123456789ab.jpg", false)]
    [InlineData("01234567-89ab-cdef-0123-456789abcdef-0123456789abcdef0123456789abcdef.gif", false)]
    [InlineData("nope.jpg", false)]
    public void AvatarImages_IsValidFileName(string fileName, bool expected)
    {
        Assert.Equal(expected, AvatarImages.IsValidFileName(fileName));
    }

    [Theory]
    [InlineData("x.jpg", "image/jpeg")]
    [InlineData("x.png", "image/png")]
    [InlineData("x.webp", "image/webp")]
    [InlineData("x", "image/webp")]
    public void AvatarImages_ContentType_ByExtension(string fileName, string expected)
    {
        Assert.Equal(expected, AvatarImages.ContentType(fileName));
    }

    [Fact]
    public void HiringFiles_Constants_MatchPlan()
    {
        Assert.Equal(3, HiringFiles.MaxFiles);
        Assert.Equal(10_485_760, HiringFiles.MaxBytes);
    }

    [Theory]
    [InlineData("0123456789abcdef0123456789abcdef.jpg", true)]
    [InlineData("0123456789abcdef0123456789abcdef.PDF", true)]
    [InlineData("0123456789abcdef0123456789abcdef.png", true)]
    [InlineData("0123456789abcdef0123456789abcdef.webp", true)]
    [InlineData("0123456789abcdef0123456789ab.jpg", false)]
    [InlineData("0123456789abcdef0123456789abcdef.txt", false)]
    [InlineData("0123456789abcdef0123456789abcdef.jpg.bak", false)]
    public void HiringFiles_IsValidStoredName(string fileName, bool expected)
    {
        Assert.Equal(expected, HiringFiles.IsValidStoredName(fileName));
    }

    [Theory]
    [InlineData(FileSignatures.FileKind.Webp, FileSignatures.AllowedKinds.Images)]
    [InlineData(FileSignatures.FileKind.Gif, FileSignatures.AllowedKinds.ImagesGifAndPdf)]
    public void DetectAccepted_WebpAndGif_AcceptedWhenAllowed(
        FileSignatures.FileKind kind, FileSignatures.AllowedKinds allowed)
    {
        var bytes = kind == FileSignatures.FileKind.Webp ? FileFixtures.WebP : FileFixtures.Gif;

        Assert.Equal(kind, FileSignatures.DetectAccepted(bytes, allowed));
    }

    [Fact]
    public void Catalog_Model_NavigationProperties_Accessible()
    {
        var category = new Category { UpdatedAt = DateTimeOffset.UtcNow.UtcDateTime };
        var translation = new CategoryTranslation { Category = category };
        var product = new Product();
        var productTranslation = new ProductTranslation { Product = product };
        var image = new ProductImage { Product = product };

        Assert.NotNull(category.UpdatedAt);
        Assert.Same(category, translation.Category);
        Assert.Same(product, productTranslation.Product);
        Assert.Same(product, image.Product);
    }

    [Fact]
    public void AdminAuditLog_Properties_Accessible()
    {
        var id = Guid.NewGuid();
        var at = DateTimeOffset.UtcNow;
        var log = new AdminAuditLog
        {
            Id = id,
            At = at,
            ActorUserId = "actor",
            TargetUserId = "target",
            Action = "user.created",
            Note = "note",
        };

        Assert.Equal(id, log.Id);
        Assert.Equal(at, log.At);
        Assert.Equal("actor", log.ActorUserId);
        Assert.Equal("target", log.TargetUserId);
        Assert.Equal("user.created", log.Action);
        Assert.Equal("note", log.Note);
    }
}
