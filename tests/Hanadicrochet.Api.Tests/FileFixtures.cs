using System.Text;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;

namespace Hanadicrochet.Api.Tests;

/// <summary>Tiny real file fixtures (the API sniffs magic bytes, not names).</summary>
public static class FileFixtures
{
    public static byte[] Png { get; } = Create(new PngEncoder());

    public static byte[] Jpeg { get; } = Create(new JpegEncoder());

    public static byte[] Gif { get; } = Create(new GifEncoder());

    public static byte[] WebP { get; } = Create(new WebpEncoder());

    /// <summary>Minimal valid-enough PDF (magic + body; the API only checks
    /// the %PDF header).</summary>
    public static byte[] Pdf { get; } =
    [
        .. Encoding.UTF8.GetBytes("%PDF-1.4\n"),
        .. Encoding.UTF8.GetBytes(
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
            + "2 0 obj << /Type /Page /Parent 1 0 R /MediaBox [0 0 200 200] >> endobj\n"
            + "xref\n0 3\n"
            + "0000000000 65535 f \n"
            + "0000000009 00000 n \n"
            + "0000000061 00000 n \n"
            + "trailer << /Size 3 /Root 1 0 R >>\n"
            + "startxref\n"
            + "123\n%%EOF\n"),
    ];

    /// <summary>Over the 10 MB chat/order/hiring file cap.</summary>
    public static byte[] TooBig { get; } =
    [
        .. Encoding.ASCII.GetBytes(new string('A', 10 * 1024 * 1024)),
        .. Jpeg,
    ];

    public static byte[] PlainText { get; } = Encoding.UTF8.GetBytes("plain text file, not an image or pdf");

    private static byte[] Create(IImageEncoder encoder)
    {
        using var image = new Image<Rgb24>(1, 1);
        using var ms = new MemoryStream();
        image.Save(ms, encoder);
        return ms.ToArray();
    }
}
