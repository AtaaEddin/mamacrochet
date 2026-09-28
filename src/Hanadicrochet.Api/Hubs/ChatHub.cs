using System.Security.Claims;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Hubs;

/// <summary>
/// Chat realtime (plan 06, D7): <c>/hubs/chat</c>. Cookie auth (Identity)
/// for order threads and staff; short-lived thread tokens (D14/D24) for
/// visitor threads — the SignalR JS client sends <c>accessToken</c> in the
/// negotiate query string. Every client method re-verifies access to the
/// target thread server-side (ChatService.CheckAccess) — never trust the
/// client. Guests get no read markers (they live in the thread).
/// </summary>
public class ChatHub(ChatService chat, ChatTokenService tokens, AppDbContext db) : Hub
{
    public static string GroupName(string threadId) => $"chat:{threadId}";

    /// <summary>
    /// Join the thread's broadcast group — only after a server-side access
    /// check (group membership is what the broadcasts target).
    /// </summary>
    public async Task JoinThread(string threadId)
    {
        var (user, token) = await ResolveCallerAsync();
        var thread = await db.ChatThreads.FirstOrDefaultAsync(
            t => t.Id == threadId, Context.ConnectionAborted);
        if (thread is null
            || await chat.CheckAccessAsync(thread, user, token, Context.ConnectionAborted) is ThreadAccess.None)
        {
            throw new HubException("forbidden");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(threadId));
    }

    /// <summary>
    /// Send a message; the server broadcasts it to the thread group (the
    /// sender reconciles its optimistic echo via <paramref name="clientId"/>).
    /// </summary>
    public async Task SendMessage(
        string threadId,
        string? body,
        string? productId,
        IReadOnlyList<string>? attachmentIds,
        string? clientId)
    {
        var (user, token) = await ResolveCallerAsync();
        var result = await chat.SendMessageAsync(
            threadId, user, token, body, productId, attachmentIds, clientId,
            Context.ConnectionAborted);
        if (result.Error is not null)
        {
            throw new HubException(result.Error.Message);
        }
    }

    /// <summary>Mark the thread read for the signed-in caller (guests: no-op).</summary>
    public async Task MarkRead(string threadId)
    {
        var (user, _) = await ResolveCallerAsync();
        if (user is null)
        {
            return;
        }

        await chat.MarkReadAsync(threadId, user, Context.ConnectionAborted);
    }

    /// <summary>
    /// Resolve who is on this connection: the Identity cookie first (order
    /// threads, staff), else a validated thread token (visitor threads).
    /// Re-run on every client method — role changes take effect immediately.
    /// </summary>
    private async Task<(AppUser? User, ChatService.ValidatedThreadToken? Token)> ResolveCallerAsync()
    {
        var context = Context.GetHttpContext();

        AppUser? user = null;
        var userId = context?.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(userId))
        {
            user = await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == userId, Context.ConnectionAborted);
        }

        ChatService.ValidatedThreadToken? token = null;
        var rawToken = context?.Request.Query["access_token"].ToString();
        if (!string.IsNullOrEmpty(rawToken))
        {
            var validated = tokens.TryValidateThreadToken(rawToken);
            if (validated is not null)
            {
                token = new ChatService.ValidatedThreadToken(
                    validated.Value.ThreadId, validated.Value.GuestId);
            }
        }

        return (user, token);
    }
}
