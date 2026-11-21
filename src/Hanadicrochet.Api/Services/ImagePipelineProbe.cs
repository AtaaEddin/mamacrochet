using NetVips;

namespace Hanadicrochet.Api.Services;

/// <summary>
/// Reports whether the image pipeline can actually run in this process: the
/// libvips native library loads AND its WebP encoder produces bytes.
///
/// The API does not ship a bundled native library on Linux — the Docker image
/// installs the distro's `vips` package (plan 20261121-1452/01). A missing,
/// wrong-architecture or version-incompatible library would otherwise surface
/// only when the first product photo is uploaded, so /health reports it and
/// deploy.sh refuses to finish on "unavailable".
///
/// A successful probe is remembered for the process lifetime (libvips, once
/// loaded, stays loaded); failures are retried on every call so a transient
/// problem does not pin the API to "unavailable" until restart.
/// </summary>
public sealed class ImagePipelineProbe(Func<bool>? encode = null, ILogger? logger = null)
{
    private readonly Func<bool> _encode = encode ?? EncodeOnePixelWebp;
    private volatile bool _ready;

    /// <summary>true once a WebP encode has succeeded in this process.</summary>
    public bool Ready => _ready || Probe();

    /// <summary>Runs the probe now (cheap: a 1x1 pixel encode, ~1 ms).</summary>
    public bool Probe()
    {
        bool encoded;
        try
        {
            encoded = _encode();
        }
        catch (Exception ex)
        {
            logger?.LogError(ex, "Image pipeline probe failed — libvips is not usable in this environment.");
            return false;
        }

        if (encoded)
        {
            _ready = true;
        }

        return encoded;
    }

    private static bool EncodeOnePixelWebp()
    {
        using var image = Image.Black(1, 1, bands: 3);
        var webp = image.WebpsaveBuffer(q: 80);
        return webp.Length > 0;
    }
}
