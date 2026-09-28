using Hanadicrochet.Api.Data;

namespace Hanadicrochet.Api.Models;

/// <summary>A previous-work file (admin-only access — plan 09).</summary>
public sealed record HiringFileDto(
    string Id,
    string FileName,
    string OriginalName,
    long Size,
    string ContentType);

/// <summary>One status-history entry (admin detail view).</summary>
public sealed record HiringEventDto(
    string Kind,
    string? Note,
    string? ActorName,
    DateTime At);

/// <summary>Hiring application as the admin queue/detail sees it.</summary>
public sealed record HiringApplicationDto(
    string Id,
    string Name,
    string Email,
    string Phone,
    string Country,
    string? Nationality,
    IReadOnlyList<string> Languages,
    string? PreviousWork,
    string? Message,
    IReadOnlyList<HiringFileDto> Files,
    string Status,
    DateTime AppliedAt,
    DateTime? DecidedAt,
    string? DecisionNote)
{
    public static HiringApplicationDto From(HiringApplication a)
    {
        return new HiringApplicationDto(
            a.Id,
            a.Name,
            a.Email,
            a.Phone,
            a.Country,
            a.Nationality,
            a.Languages,
            a.PreviousWork,
            a.Message,
            a.Files
                .OrderBy(f => f.SortOrder)
                .Select(f => new HiringFileDto(
                    f.Id,
                    $"/files/hiring/{a.Id}/{f.StoredName}",
                    f.OriginalName,
                    f.Size,
                    f.ContentType))
                .ToList(),
            a.Status,
            a.AppliedAt,
            a.DecidedAt,
            a.DecisionNote);
    }
}

/// <summary>Admin detail: the application + who decided + the full history.</summary>
public sealed record HiringApplicationDetailDto(
    HiringApplicationDto Application,
    string? DecidedByName,
    IReadOnlyList<HiringEventDto> Events)
{
    public static HiringApplicationDetailDto From(HiringApplication a)
    {
        return new HiringApplicationDetailDto(
            HiringApplicationDto.From(a),
            a.DecidedBy?.DisplayName,
            a.Events
                .OrderBy(e => e.At)
                .Select(e => new HiringEventDto(e.Kind, e.Note, e.ActorName, e.At))
                .ToList());
    }
}

public sealed record HiringPage(
    IReadOnlyList<HiringApplicationDto> Items,
    int Total,
    int Page,
    int PageSize);

/// <summary>Public submit result: the application id + whether it was a re-apply.</summary>
public sealed record HiringSubmitted(string Id, bool Reapplied);

/// <summary>
/// Accept request (plan 09): the admin confirms/corrects the contact data
/// before the employee account is created.
/// </summary>
public sealed record AcceptHiringRequest(
    string Email,
    string DisplayName,
    string? Phone,
    string? Country,
    string Language);

public sealed record DeclineHiringRequest(string? Note);

/// <summary>Accept result: the created employee account + one-time temp password (shared offline — release 1 has no email, D13).</summary>
public sealed record HiringAccepted(
    HiringApplicationDto Application,
    UserDto User,
    string TemporaryPassword);
