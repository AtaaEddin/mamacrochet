using Hanadicrochet.Api.Services;
using NetVips;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Product image pipeline (plan 20261005-1348/03): pure unit tests — real
/// images generated with libvips, processed through the same magic-byte gate
/// + WebP encode the endpoint uses.
/// </summary>
public class ProductImagesTests
{
    private static Task<ProductImages.Processed?> Process(byte[] bytes)
        => ProductImages.ProcessAsync(new MemoryStream(bytes), CancellationToken.None);

    private static byte[] Jpeg(int w, int h) => Encode(w, h, ".jpg");

    private static byte[] Png(int w, int h) => Encode(w, h, ".png");

    private static byte[] WebP(int w, int h) => Encode(w, h, ".webp");

    private static byte[] Encode(int w, int h, string suffix)
    {
        using var image = Image.Black(w, h, bands: 3);
        return image.WriteToBuffer(suffix);
    }

    private static void AssertIsWebp(byte[] bytes)
    {
        Assert.True(bytes.Length > 12, "webp too small");
        Assert.Equal((byte)'R', bytes[0]);
        Assert.Equal((byte)'I', bytes[1]);
        Assert.Equal((byte)'F', bytes[2]);
        Assert.Equal((byte)'F', bytes[3]);
        Assert.Equal((byte)'W', bytes[8]);
        Assert.Equal((byte)'E', bytes[9]);
        Assert.Equal((byte)'B', bytes[10]);
        Assert.Equal((byte)'P', bytes[11]);
    }

    [Fact]
    public async Task Jpeg_Large_DownscaledToMainAndThumb()
    {
        var result = await Process(Jpeg(2000, 1500));
        Assert.NotNull(result);
        Assert.Equal(1600, result!.Width);  // long side capped at 1600
        Assert.Equal(1200, result.Height);
        AssertIsWebp(result.Main);
        AssertIsWebp(result.Thumb);
        Assert.True(result.Main.Length > result.Thumb.Length);
    }

    [Fact]
    public async Task Png_Small_NotResized_DimensionsPreserved()
    {
        var result = await Process(Png(100, 50));
        Assert.NotNull(result);
        Assert.Equal(100, result!.Width);
        Assert.Equal(50, result.Height);
        AssertIsWebp(result.Main);
        AssertIsWebp(result.Thumb);
    }

    [Fact]
    public async Task WebP_Input_Accepted()
    {
        var result = await Process(WebP(300, 300));
        Assert.NotNull(result);
        Assert.Equal(300, result!.Width);
        Assert.Equal(300, result.Height);
    }

    [Fact]
    public async Task OnePixel_StillProcesses()
    {
        var result = await Process(Png(1, 1));
        Assert.NotNull(result);
        Assert.Equal(1, result!.Width);
        Assert.Equal(1, result.Height);
    }

    [Fact]
    public async Task Thumbnail_IsCappedAtThumbSide()
    {
        var result = await Process(Png(1600, 800));
        Assert.NotNull(result);
        Assert.Equal(1600, result!.Width);

        // 1600×800 thumb → 480×240 (long side capped, aspect kept).
        using var thumb = Image.NewFromBuffer(result.Thumb);
        Assert.Equal(480, thumb.Width);
        Assert.Equal(240, thumb.Height);
    }

    [Fact]
    public async Task SourceTooWide_BeyondMaxSourceSide_Null()
    {
        // 10001×8 is tiny in memory but breaches MaxSourceSide (10 000).
        var result = await Process(Png(10_001, 8));
        Assert.Null(result);
    }

    [Fact]
    public async Task EmptyStream_Null()
    {
        Assert.Null(await Process(Array.Empty<byte>()));
    }

    [Fact]
    public async Task OverTenMegabytes_Null()
    {
        var tooBig = new byte[ProductImages.MaxUploadBytes + 1];
        // Content is irrelevant — the length gate trips before decode.
        var result = await Process(tooBig);
        Assert.Null(result);
    }

    [Fact]
    public async Task UnknownMagic_GifBytes_Null()
    {
        var gif = new byte[] { 0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0 };
        Assert.Null(await Process(gif));
    }

    [Fact]
    public async Task TruncatedMagic_TwoBytes_Null()
    {
        // 2 bytes: too short for any signature, so the gate rejects it.
        var truncated = new byte[] { 0xFF, 0xD8 };
        Assert.Null(await Process(truncated));
    }

    [Fact]
    public async Task ValidMagic_CorruptBody_Null()
    {
        // JPEG SOI marker followed by junk: magic passes, decode fails.
        var corrupt = new byte[64];
        corrupt[0] = 0xFF;
        corrupt[1] = 0xD8;
        corrupt[2] = 0xFF;
        corrupt[3] = 0xE0;
        for (var i = 4; i < corrupt.Length; i++)
        {
            corrupt[i] = (byte)(i * 7);
        }

        Assert.Null(await Process(corrupt));
    }

    [Fact]
    public async Task TruncatedJpeg_Null()
    {
        // Valid header, body cut off: dimensions read, decode then fails.
        var full = Jpeg(800, 600);
        var result = await Process(full[..(full.Length * 6 / 10)]);
        Assert.Null(result);
    }

    [Fact]
    public void NamePatterns_MainAndThumb()
    {
        Assert.Equal("abc.webp", ProductImages.Processed.MainName("abc"));
        Assert.Equal("abc.thumb.webp", ProductImages.Processed.ThumbName("abc"));
    }
}
