using Mamacrochet.Api.Data;
using Mamacrochet.Api.Endpoints;
using Mamacrochet.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Mamacrochet.Api.Services;

/// <summary>A validated previous-work upload (bytes + original name).</summary>
public sealed record UploadFile(string OriginalName, byte[] Bytes);

public sealed record SubmitHiringResult(ApiError? Error, HiringApplication? Application, bool Honeypot, bool Reapplied);

public sealed record DecideHiringResult(
    ApiError? Error,
    HiringApplication? Application,
    AppUser? User,
    string? TemporaryPassword);

/// <summary>
/// Domain rules for hiring (plan 09): public submit (honeypot, validation,
/// one row per e-mail with re-apply), admin accept (creates the employee
/// account with a temp password — shared offline, no email in release 1) and
/// decline. Decisions are only valid from status <c>new</c>; every change
/// writes its event + the audit row in the same save.
/// </summary>
public sealed class HiringService(UserManager<AppUser> userManager, AppDbContext db, IOptions<UploadsOptions> uploads)
{
    public async Task<SubmitHiringResult> SubmitAsync(
        string? name,
        string? email,
        string? phone,
        string? country,
        string? nationality,
        IReadOnlyList<string>? languages,
        string? previousWork,
        string? message,
        string? honeypot,
        IReadOnlyList<UploadFile> files)
    {
        // Honeypot (D16): bots fill the hidden field — answer warmly, store nothing.
        if (!string.IsNullOrWhiteSpace(honeypot))
        {
            return new SubmitHiringResult(null, null, true, false);
        }

        var trimmedName = name?.Trim() ?? "";
        var trimmedEmail = email?.Trim() ?? "";
        var trimmedPhone = phone?.Trim() ?? "";
        var trimmedCountry = country?.Trim() ?? "";
        var trimmedNationality = nationality?.Trim();
        var trimmedPreviousWork = previousWork?.Trim();
        var trimmedMessage = message?.Trim();

        if (trimmedName.Length is < 2 or > 80
            || trimmedEmail.Length is < 3 or > 320
            || !IsValidEmailShape(trimmedEmail)
            || trimmedPhone.Length is < 3 or > 20
            || trimmedCountry.Length is < 2 or > 64
            || trimmedNationality is { Length: > 64 }
            || trimmedPreviousWork is { Length: > 4000 }
            || trimmedMessage is { Length: > 2000 })
        {
            return new SubmitHiringResult(new ApiError("invalid", "Check the values and try again."), null, false, false);
        }

        if (languages is null || languages.Count == 0 || languages.Count > 6)
        {
            return new SubmitHiringResult(new ApiError("invalid_language", "Add between one and six languages."), null, false, false);
        }

        var cleanLanguages = languages
            .Select(l => l.Trim())
            .Where(l => l.Length is >= 2 and <= 32)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (cleanLanguages.Count == 0)
        {
            return new SubmitHiringResult(new ApiError("invalid_language", "Add between one and six languages."), null, false, false);
        }

        if (files.Count > HiringFiles.MaxFiles)
        {
            return new SubmitHiringResult(
                new ApiError("too_many_files", $"You can attach up to {HiringFiles.MaxFiles} files."), null, false, false);
        }

        foreach (var file in files)
        {
            if (file.Bytes.Length == 0)
            {
                return new SubmitHiringResult(new ApiError("invalid", "Check the values and try again."), null, false, false);
            }

            if (HiringFiles.DetectExtension(file.Bytes) is null)
            {
                return new SubmitHiringResult(
                    new ApiError("unsupported_file_type", "Use a JPG, PNG or WEBP photo, or a PDF."), null, false, false);
            }
        }

        var now = DateTime.UtcNow;
        var existing = await db.HiringApplications
            .Include(a => a.Files)
            .FirstOrDefaultAsync(a => a.NormalizedEmail == trimmedEmail.ToUpperInvariant());

        HiringApplication application;
        bool reapplied;
        if (existing is not null)
        {
            application = existing;
            reapplied = true;
            application.Status = HiringStatus.New;
            application.DecidedAt = null;
            application.DecidedById = null;
            application.DecisionNote = null;
            application.UpdatedAt = now;
        }
        else
        {
            application = new HiringApplication
            {
                Id = Guid.NewGuid().ToString("N"),
                NormalizedEmail = trimmedEmail.ToUpperInvariant(),
                Status = HiringStatus.New,
                AppliedAt = now,
                UpdatedAt = now,
            };
            reapplied = false;
            db.HiringApplications.Add(application);
        }

        application.Name = trimmedName;
        application.Email = trimmedEmail;
        application.Phone = trimmedPhone;
        application.Country = trimmedCountry;
        application.Nationality = string.IsNullOrWhiteSpace(trimmedNationality) ? null : trimmedNationality;
        application.Languages = [.. cleanLanguages];
        application.PreviousWork = string.IsNullOrWhiteSpace(trimmedPreviousWork) ? null : trimmedPreviousWork;
        application.Message = string.IsNullOrWhiteSpace(trimmedMessage) ? null : trimmedMessage;

        // Replace the file set (old files deleted best-effort).
        var directory = Path.Combine(uploads.Value.Root, "hiring", application.Id);
        Directory.CreateDirectory(directory);
        foreach (var old in application.Files)
        {
            db.HiringApplicationFiles.Remove(old);
            DeleteStored(directory, old.StoredName);
        }

        for (var index = 0; index < files.Count; index++)
        {
            var file = files[index];
            var id = Guid.NewGuid().ToString("N");
            var storedName = $"{id}{HiringFiles.DetectExtension(file.Bytes)}";
            await File.WriteAllBytesAsync(Path.Combine(directory, storedName), file.Bytes);
            application.Files.Add(new HiringApplicationFile
            {
                Id = id,
                ApplicationId = application.Id,
                StoredName = storedName,
                OriginalName = SafeOriginalName(file.OriginalName),
                Size = file.Bytes.Length,
                ContentType = HiringFiles.ContentType(storedName),
                SortOrder = index,
            });
        }

        application.Events.Add(new HiringApplicationEvent
        {
            Id = Guid.NewGuid().ToString("N"),
            ApplicationId = application.Id,
            Kind = reapplied ? HiringEventKind.Reapplied : HiringEventKind.Submitted,
            ActorName = trimmedName,
            At = now,
        });

        await db.SaveChangesAsync();
        return new SubmitHiringResult(null, application, false, reapplied);
    }

    public async Task<DecideHiringResult> AcceptAsync(string id, AcceptHiringRequest request, string actorId, string actorName)
    {
        var application = await LoadAsync(id);
        if (application is null)
        {
            return new DecideHiringResult(ApiError.NotFound("hiring_not_found"), null, null, null);
        }

        if (application.Status != HiringStatus.New)
        {
            return new DecideHiringResult(
                new ApiError("already_decided", "This application was already decided."), null, null, null);
        }

        var email = request.Email.Trim();
        var displayName = request.DisplayName.Trim();
        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        var country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country!.Trim();

        if (email.Length is < 3 or > 320 || !IsValidEmailShape(email)
            || displayName.Length is < 2 or > 80
            || phone is { Length: > 20 }
            || country is { Length: > 64 }
            || !Languages.IsValid(request.Language))
        {
            return new DecideHiringResult(new ApiError("invalid", "Check the values and try again."), null, null, null);
        }

        var taken = await db.Users
            .AsNoTracking()
            .AnyAsync(u => u.NormalizedEmail == email.ToUpperInvariant() && u.DeletedAt == null);
        if (taken)
        {
            return new DecideHiringResult(
                new ApiError("email_taken", "An account with this email already exists."), null, null, null);
        }

        var temporaryPassword = TempPasswords.Generate();
        var user = new AppUser
        {
            UserName = email,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = displayName,
            Phone = phone,
            Country = country,
            Language = request.Language,
            IsEmployee = true,
            MustChangePassword = true,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        var created = await userManager.CreateAsync(user, temporaryPassword);
        if (!created.Succeeded)
        {
            return new DecideHiringResult(UserAdministrationService.FromIdentityResult(created), null, null, null);
        }

        var now = DateTime.UtcNow;
        application.Status = HiringStatus.Accepted;
        application.DecidedAt = now;
        application.DecidedById = actorId;
        application.DecisionNote = null;
        application.UpdatedAt = now;
        application.Events.Add(new HiringApplicationEvent
        {
            Id = Guid.NewGuid().ToString("N"),
            ApplicationId = application.Id,
            Kind = HiringEventKind.Accepted,
            ActorId = actorId,
            ActorName = actorName,
            At = now,
        });

        // The trace is atomic with the decision (plan 03 pattern).
        db.AdminAuditLogs.Add(new AdminAuditLog
        {
            At = DateTimeOffset.UtcNow,
            ActorUserId = actorId,
            TargetUserId = user.Id,
            Action = "hiring.accepted",
            Note = $"email={email}",
        });

        await db.SaveChangesAsync();
        return new DecideHiringResult(null, application, user, temporaryPassword);
    }

    public async Task<DecideHiringResult> DeclineAsync(string id, string? note, string actorId, string actorName)
    {
        var application = await LoadAsync(id);
        if (application is null)
        {
            return new DecideHiringResult(ApiError.NotFound("hiring_not_found"), null, null, null);
        }

        if (application.Status != HiringStatus.New)
        {
            return new DecideHiringResult(
                new ApiError("already_decided", "This application was already decided."), null, null, null);
        }

        var trimmedNote = note?.Trim();
        if (trimmedNote is { Length: > 1000 })
        {
            return new DecideHiringResult(new ApiError("invalid", "Check the values and try again."), null, null, null);
        }

        var now = DateTime.UtcNow;
        application.Status = HiringStatus.Declined;
        application.DecidedAt = now;
        application.DecidedById = actorId;
        application.DecisionNote = string.IsNullOrWhiteSpace(trimmedNote) ? null : trimmedNote;
        application.UpdatedAt = now;
        application.Events.Add(new HiringApplicationEvent
        {
            Id = Guid.NewGuid().ToString("N"),
            ApplicationId = application.Id,
            Kind = HiringEventKind.Declined,
            Note = application.DecisionNote,
            ActorId = actorId,
            ActorName = actorName,
            At = now,
        });

        db.AdminAuditLogs.Add(new AdminAuditLog
        {
            At = DateTimeOffset.UtcNow,
            ActorUserId = actorId,
            // No user row yet — the application reference lives in the note.
            TargetUserId = "",
            Action = "hiring.declined",
            Note = $"application={application.Id} email={application.Email}",
        });

        await db.SaveChangesAsync();
        return new DecideHiringResult(null, application, null, null);
    }

    private async Task<HiringApplication?> LoadAsync(string id)
    {
        if (!IsApplicationId(id))
        {
            return null;
        }

        return await db.HiringApplications
            .Include(a => a.Files)
            .FirstOrDefaultAsync(a => a.Id == id);
    }

    private static bool IsApplicationId(string id)
    {
        if (id.Length != 32)
        {
            return false;
        }

        return id.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F');
    }

    private static bool IsValidEmailShape(string email)
    {
        // Light shape check for the public form: the real validation happens
        // when the account is created (ASP.NET Identity, on accept).
        var at = email.IndexOf('@');
        return at is > 0
            && at < email.Length - 1
            && email.IndexOf('@', at + 1) == -1
            && !email.Contains(' ')
            && !email.Contains('<')
            && !email.Contains('>');
    }

    private static string SafeOriginalName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        return name.Length > 0 && name.Length <= 200 ? name : "upload";
    }

    private static void DeleteStored(string directory, string storedName)
    {
        if (!HiringFiles.IsValidStoredName(storedName))
        {
            return;
        }

        var path = Path.Combine(directory, storedName);
        if (File.Exists(path))
        {
            try
            {
                File.Delete(path);
            }
            catch (IOException)
            {
                // Best effort — the old file simply lingers.
            }
        }
    }
}
