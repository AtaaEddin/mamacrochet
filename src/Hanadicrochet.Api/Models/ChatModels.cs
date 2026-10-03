namespace Hanadicrochet.Api.Models;

// ---- Requests -------------------------------------------------------------

public sealed record VisitorThreadRequest(
    string GuestId,
    string? Name,
    /// <summary>Honeypot (D16) — hidden field, always empty from real UI.</summary>
    string? Website,
    /// <summary>
    /// Guest "new conversation" (plan 20261003-2254 sub 01): close this
    /// device's active visitor thread and start a fresh one. Rate-limited
    /// (5 resets / device / 24 h — D16); old clients omit it (default false).
    /// </summary>
    bool? Reset);

public sealed record SendMessageRequest(
    string? Body,
    string? ProductId,
    /// <summary>
    /// Client-generated id for optimistic echo (echoed back on the broadcast
    /// so the sender can reconcile its local placeholder).
    /// </summary>
    string? ClientId,
    IReadOnlyList<string>? AttachmentIds);

public sealed record MarkReadRequest(string? LastMessageId);

public sealed record StaffAssignRequest(string EmployeeId);

public sealed record StaffCloseRequest(string? Reason);

/// <summary>
/// New conversation (cookie auth). Customers create a thread with
/// themselves (<see cref="CustomerId"/> ignored); staff create one with an
/// existing customer (required, assigned to the caller).
/// </summary>
public sealed record CreateThreadRequest(
    string? Subject,
    string? CustomerId);

// ---- Responses ------------------------------------------------------------

/// <summary>Bootstrap (or re-open) result for a visitor thread.</summary>
public sealed record VisitorThreadCreated(ThreadDto Thread, string Token);

public sealed record ThreadListItemDto(
    string Id,
    string Kind,
    string? Subject,
    bool IsClosed,
    DateTime? LastMessageAt,
    MessagePreviewDto? Preview,
    int Unread,
    string? OrderStatus,
    string? AssigneeName);

/// <summary>Raw last-message parts — the UI composes the localized preview.</summary>
public sealed record MessagePreviewDto(
    string? Text,
    string? SenderName,
    string SenderRole,
    bool HasAttachments,
    string? ProductName,
    DateTime At);

public sealed record ThreadDto(
    string Id,
    string Kind,
    string? Subject,
    bool IsClosed,
    string? ClosedReason,
    DateTime CreatedAt,
    DateTime? LastMessageAt,
    ChatOrderRefDto? Order,
    IReadOnlyList<ChatParticipantDto> Participants);

public sealed record ChatOrderRefDto(string Id, string Status);

public sealed record ChatParticipantDto(string Name, string Role);

public sealed record ChatMessageDto(
    string Id,
    DateTime At,
    string SenderName,
    string SenderRole,
    string Body,
    string? ProductId,
    string? ProductName,
    bool Deleted,
    IReadOnlyList<ChatAttachmentDto> Attachments,
    string? ClientId);

/// <summary><see cref="Url"/> is a short-lived signed read link (D25).</summary>
public sealed record ChatAttachmentDto(
    string Id,
    string Url,
    string ContentType,
    string OriginalName,
    long Bytes);

public sealed record MessagePageDto(
    IReadOnlyList<ChatMessageDto> Messages,
    bool HasOlder,
    bool HasNewer);

public sealed record ChatThreadListDto(
    IReadOnlyList<ThreadListItemDto> Threads,
    int Page,
    int Pages);

/// <summary>Staff customer picker row (sub-plan 02 — New conversation).</summary>
public sealed record CustomerDto(
    string Id,
    string DisplayName,
    string? Phone,
    string? Email);

public sealed record CustomerPageDto(
    IReadOnlyList<CustomerDto> Customers,
    int Page,
    int Pages);

public sealed record ChatAttachmentListDto(IReadOnlyList<ChatAttachmentDto> Attachments);

// ---- Service results -------------------------------------------------------

public sealed record ChatThreadResult(ApiError? Error, ThreadDto? Thread);

public sealed record ChatThreadListResult(ApiError? Error, ChatThreadListDto? Threads);

public sealed record ChatMessageResult(ApiError? Error, ChatMessageDto? Message);

public sealed record ChatMessagePageResult(ApiError? Error, MessagePageDto? Page);

public sealed record ChatAttachmentListResult(ApiError? Error, ChatAttachmentListDto? Attachments);

/// <summary>
/// <see cref="HoneyPotted"/> = the honeypot was filled: the response looks
/// successful (a fabricated thread + a token that authenticates to nothing),
/// so bots get a warm answer while nothing is stored (D16).
/// </summary>
public sealed record VisitorThreadResult(
    ApiError? Error,
    VisitorThreadCreated? Created,
    bool HoneyPotted);
