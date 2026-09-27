using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Processing.Processors.Transforms;

namespace Mamacrochet.Api.Services;

/// <summary>
/// Product image pipeline (plan 04): accept jpg/png/webp (magic-byte check),
/// process to WebP — main ≤1600px (q82) + thumbnail ≤480px (q80).
/// Input types follow the plan 03 precedent (avatar uploads); AVIF/HEIC are
/// intentionally not in release 1 (no built-in ImageSharp codec — native
/// third-party decoders don't fit the low-power self-host target).
/// </summary>
public static partial class ProductImages
{
    public const long MaxUploadBytes = 10 * 1024 * 1024; // ~10 MB per file
    public const int MaxPerRequest = 10;                 // files per append request
    public const int MaxMainSide = 1600;
    public const int MaxThumbSide = 480;
    public const int MaxSourceSide = 10_000;

    public sealed record Processed(
        byte[] Main,
        byte[] Thumb,
        int Width,
        int Height)
    {
        /// <summary>File name pattern under the product directory.</summary>
        public static string MainName(string imageId) => $"{imageId}.webp";
        public static string ThumbName(string imageId) => $"{imageId}.thumb.webp";
    }

    public static async Task<Processed?> ProcessAsync(Stream source, CancellationToken ct)
    {
        // 1) Magic-byte format gate (jpg/png/webp only).
        await using var input = new MemoryStream();
        source.CopyTo(input);
        if (input.Length == 0 || input.Length > MaxUploadBytes)
        {
            return null;
        }
        input.Position = 0;
        if (DetectKind(input.GetBuffer()!, (int)input.Length) is not (Kind.Jpeg or Kind.Png or Kind.WebP))
        {
            return null;
        }

        // 2) Identify (dimensions) — decode failures surface as null too.
        ImageInfo info;
        try
        {
            info = await Image.IdentifyAsync(input, ct);
        }
        catch (Exception)
        {
            return null;
        }

        if (info is null
            || info.Width <= 0 || info.Height <= 0
            || info.Width > MaxSourceSide || info.Height > MaxSourceSide)
        {
            return null;
        }

        input.Position = 0;

        // 3) Decode + downscale the main image (≤1600 on the long side).
        using var image = await Image.LoadAsync(input, ct);
        if (image.Width > MaxMainSide || image.Height > MaxMainSide)
        {
            image.Mutate(m => m.ApplyProcessor(new ResizeProcessor(
                new ResizeOptions
                {
                    Mode = ResizeMode.Max,
                    Size = new Size(MaxMainSide, MaxMainSide),
                },
                image.Size)));
        }

        // 4) Encode main WebP.
        using var mainStream = new MemoryStream();
        await image.SaveAsWebpAsync(mainStream, new WebpEncoder { Quality = 82 }, ct);

        // 5) Thumbnail from the processed image (≤480 on the long side).
        using var thumb = image.Clone(c =>
        {
            if (image.Width > MaxThumbSide || image.Height > MaxThumbSide)
            {
                c.ApplyProcessor(new ResizeProcessor(
                    new ResizeOptions
                    {
                        Mode = ResizeMode.Max,
                        Size = new Size(MaxThumbSide, MaxThumbSide),
                    },
                    image.Size));
            }
        });
        using var thumbStream = new MemoryStream();
        await thumb.SaveAsWebpAsync(thumbStream, new WebpEncoder { Quality = 80 }, ct);

        return new Processed(mainStream.ToArray(), thumbStream.ToArray(), image.Width, image.Height);
    }

    public enum Kind { Unknown, Jpeg, Png, WebP }

    private static Kind DetectKind(byte[] buffer, int length)
    {
        if (length >= 3
            && buffer[0] == 0xFF && buffer[1] == 0xD8 && buffer[2] == 0xFF)
        {
            return Kind.Jpeg;
        }

        if (length >= 8
            && buffer[0] == 0x89 && buffer[1] == 0x50 && buffer[2] == 0x4E && buffer[3] == 0x47
            && buffer[4] == 0x0D && buffer[5] == 0x0A && buffer[6] == 0x1A && buffer[7] == 0x0A)
        {
            return Kind.Png;
        }

        if (length >= 12
            && buffer[0] == 0x52 && buffer[1] == 0x49 && buffer[2] == 0x46 && buffer[3] == 0x46
            && buffer[8] == 0x57 && buffer[9] == 0x45 && buffer[10] == 0x42 && buffer[11] == 0x50)
        {
            return Kind.WebP;
        }

        return Kind.Unknown;
    }
}
