using Mamacrochet.Api.Models;
using Microsoft.Extensions.Options;

namespace Mamacrochet.Api.Endpoints;

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
    }
}
