using NetVips;

namespace Hanadicrochet.Api.Services;

/// <summary>
/// Product image pipeline (plan 04): accept jpg/png/webp (magic-byte check),
/// process to WebP — main ≤1600px (q82) + thumbnail ≤480px (q80).
/// Input types follow the plan 03 precedent (avatar uploads); AVIF/HEIC are
/// intentionally not in release 1 (the runtime libvips needs extra loaders
/// for them — not worth the image size on the low-power self-host target).
/// </summary>
/// <remarks>
/// NetVips/libvips replaced ImageSharp in plan 20261121-1452/01: the patched
/// ImageSharp release enforces a build-time licence key, and libvips (LGPL,
/// the engine behind sharp/imgproxy) decodes untrusted input without
/// crashing the process. The runtime image installs the distro libvips
/// (`apk add vips`); libvips honours EXIF orientation while thumbnailing.
/// </remarks>
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
        await source.CopyToAsync(input, ct);
        if (input.Length == 0 || input.Length > MaxUploadBytes)
        {
            return null;
        }

        var bytes = input.GetBuffer().AsSpan(0, (int)input.Length).ToArray();
        if (DetectKind(bytes) is not (Kind.Jpeg or Kind.Png or Kind.WebP))
        {
            return null;
        }

        // 2) libvips is synchronous and CPU-bound — keep it off the request thread.
        return await Task.Run(() => Process(bytes, ct), ct);
    }

    private static Processed? Process(byte[] bytes, CancellationToken ct)
    {
        try
        {
            // Header-only read: dimensions are known before any pixels are decoded.
            // failOn Warning: libvips otherwise salvages truncated JPEGs (grey
            // bands) — a corrupt upload must be rejected, not silently stored.
            using var source = Image.NewFromBuffer(bytes, failOn: Enums.FailOn.Warning);
            if (source.Width <= 0 || source.Height <= 0
                || source.Width > MaxSourceSide || source.Height > MaxSourceSide)
            {
                return null;
            }

            // 3) Downscale the main image (≤1600 on the long side, never upscaled).
            ct.ThrowIfCancellationRequested();
            using var main = source.ThumbnailImage(
                MaxMainSide, MaxMainSide, size: Enums.Size.Down);
            var mainBytes = main.WebpsaveBuffer(q: 82);

            // 4) Thumbnail from the processed image (≤480 on the long side).
            ct.ThrowIfCancellationRequested();
            using var thumb = main.ThumbnailImage(
                MaxThumbSide, MaxThumbSide, size: Enums.Size.Down);
            var thumbBytes = thumb.WebpsaveBuffer(q: 80);

            return new Processed(mainBytes, thumbBytes, main.Width, main.Height);
        }
        catch (VipsException)
        {
            // Truncated/corrupt payloads fail here rather than crash the process.
            return null;
        }
    }

    public enum Kind { Unknown, Jpeg, Png, WebP }

    private static Kind DetectKind(byte[] buffer)
    {
        var length = buffer.Length;
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
