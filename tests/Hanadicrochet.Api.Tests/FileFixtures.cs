using System.Text;
using NetVips;

namespace Hanadicrochet.Api.Tests;

/// <summary>Tiny real file fixtures (the API sniffs magic bytes, not names).</summary>
public static class FileFixtures
{
    /// <summary>1×1 transparent GIF89a — Skia encodes PNG/JPEG/WebP only, and
    /// the API never decodes GIF (it is rejected by signature).</summary>
    private static readonly byte[] MinimalGif =
    [
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
        0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
        0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00,
        0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        0x02, 0x02, 0x44, 0x01, 0x00, 0x3B,
    ];

    public static byte[] Png { get; } = Create(".png");

    public static byte[] Jpeg { get; } = Create(".jpg");

    public static byte[] Gif { get; } = MinimalGif;

    public static byte[] WebP { get; } = Create(".webp");

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

    private static byte[] Create(string suffix)
    {
        using var image = Image.Black(1, 1, bands: 3);
        return image.WriteToBuffer(suffix);
    }
}
