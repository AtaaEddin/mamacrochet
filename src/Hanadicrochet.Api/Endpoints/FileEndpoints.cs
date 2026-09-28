using System.Text.RegularExpressions;
using Hanadicrochet.Api.Models;
using Microsoft.Extensions.Options;

namespace Hanadicrochet.Api.Endpoints;

/// <summary>
/// Serves uploaded files (plan 03: avatars; plans 04/05/06: product images,
/// receipts, customer samples). Files live on local disk (D8); names are
/// opaque and validated — no path traversal.
/// </summary>
public static class FileEndpoints
{
    public static void MapFileEndpoints(this IEndpointRouteBuilder app, IOptions<UploadsOptions> uploads)
    {
        app.MapGet("/files/avatars/{fileName}", (string fileName) =>
        {
            if (!AvatarImages.IsValidFileName(fileName))
            {
                return Results.NotFound();
            }

            var path = Path.Combine(uploads.Value.Root, "avatars", fileName);
            if (!File.Exists(path))
            {
                return Results.NotFound();
            }

            return Results.File(path, AvatarImages.ContentType(fileName));
        })
        // Operation id is picked up by the OpenAPI document; the binary-file
        // transformer in Program.cs keys on it (its 404 has no JSON body).
        .WithName("files.getAvatar")
        .WithTags("Files");

        // Product images (plan 04): immutable WebP files under
        // {root}/products/{productId}/ — names are opaque and validated.
        app.MapGet("/files/products/{productId}/{fileName}",
            (string productId, string fileName, HttpContext context) =>
            {
                if (!ProductImageFiles.IsValidName(productId, fileName))
                {
                    return Results.NotFound();
                }

                var path = Path.Combine(uploads.Value.Root, "products", productId, fileName);
                if (!File.Exists(path))
                {
                    return Results.NotFound();
                }

                context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
                return Results.File(path, "image/webp", enableRangeProcessing: true);
            })
            .WithName("files.getProductImage")
            .WithTags("Files");
    }

    internal static class ProductImageFiles
    {
        private static readonly Regex NamePattern = new(
            "^[0-9a-f]{32}(\\.thumb)?\\.webp$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex IdPattern = new(
            "^[0-9a-f]{32}$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        /// <summary>
        /// File names are `{imageId}.webp` / `{imageId}.thumb.webp` and must
        /// belong to the product in the URL (no cross-product serving).
        /// </summary>
        public static bool IsValidName(string productId, string fileName)
        {
            return IdPattern.IsMatch(productId)
                && NamePattern.IsMatch(fileName)
                && fileName.StartsWith(productId, StringComparison.OrdinalIgnoreCase);
        }
    }
}
