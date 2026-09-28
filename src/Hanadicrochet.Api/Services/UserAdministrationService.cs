using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Services;

public sealed record CreateUserResult(ApiError? Error, AppUser? User, string? TemporaryPassword);

public sealed record UpdateUserResult(ApiError? Error, AppUser? User);

public sealed record ResetPasswordResult(ApiError? Error, string? TemporaryPassword);

public sealed record DeleteUserResult(ApiError? Error);

/// <summary>
/// Domain rules for admin user management (plan 03): creation with a
/// temporary password, edits (profile / roles / assignment / status),
/// password reset, soft delete — every sensitive action audited in the same
/// save as the change.
/// </summary>
public sealed class UserAdministrationService(UserManager<AppUser> userManager, AppDbContext db)
{
    public async Task<CreateUserResult> CreateAsync(CreateUserRequest request, string actorId)
    {
        var email = request.Email.Trim();
        var existing = await db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.NormalizedEmail == email.ToUpperInvariant() && u.DeletedAt == null);
        if (existing is not null && existing.DeletedAt is null)
        {
            return new CreateUserResult(new ApiError("email_taken", "An account with this email already exists."), null, null);
        }

        var temporaryPassword = TempPasswords.Generate();
        var user = new AppUser
        {
            UserName = email,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = request.DisplayName.Trim(),
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone!.Trim(),
            Country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country!.Trim(),
            Language = request.Language,
            IsEmployee = request.Roles.Contains(RoleFlags.Employee),
            IsAdmin = request.Roles.Contains(RoleFlags.Admin),
            MustChangePassword = true,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        var created = await userManager.CreateAsync(user, temporaryPassword);
        if (!created.Succeeded)
        {
            return new CreateUserResult(UserAdministrationService.FromIdentityResult(created), null, null);
        }

        // AuditAsync only stages the row; persist it in the same save as the
        // new user so the trace is atomic with the change.
        await AuditAsync(actorId, user.Id, "user.created", $"email={email}");
        await db.SaveChangesAsync();
        return new CreateUserResult(null, user, temporaryPassword);
    }

    public async Task<UpdateUserResult> UpdateAsync(string id, UpdateUserRequest request, string actorId)
    {
        var target = await db.Users
            .Include(u => u.AssignedEmployee)
            .FirstOrDefaultAsync(u => u.Id == id && u.DeletedAt == null);
        if (target is null)
        {
            return new UpdateUserResult(ApiError.NotFound("user_not_found"), null);
        }

        var rolesChanged =
            target.IsEmployee != request.Roles.Contains(RoleFlags.Employee)
            || target.IsAdmin != request.Roles.Contains(RoleFlags.Admin);
        var assignChanged = target.AssignedEmployeeId != request.AssignedEmployeeId;
        var statusChanged = target.IsActive != request.IsActive;

        // An admin may not lock themselves out of the back office.
        if (target.Id == actorId && (rolesChanged || statusChanged || assignChanged))
        {
            return new UpdateUserResult(new ApiError("self_modification", "You cannot change your own roles, status or assignment."), null);
        }

        if (request.AssignedEmployeeId is not null)
        {
            var employee = await db.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == request.AssignedEmployeeId
                    && (u.IsEmployee || u.IsAdmin)
                    && u.IsActive
                    && u.DeletedAt == null);
            if (employee is null)
            {
                return new UpdateUserResult(new ApiError("invalid_employee", "The assigned employee does not exist or is not active."), null);
            }
        }

        target.DisplayName = request.DisplayName.Trim();
        target.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone!.Trim();
        target.Country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country!.Trim();
        target.Language = request.Language;

        if (rolesChanged)
        {
            target.IsEmployee = request.Roles.Contains(RoleFlags.Employee);
            target.IsAdmin = request.Roles.Contains(RoleFlags.Admin);
            await AuditAsync(actorId, target.Id, "user.roles.changed",
                string.Join(", ", UserDto.RolesOf(target)));
        }

        if (assignChanged)
        {
            target.AssignedEmployeeId = request.AssignedEmployeeId;
            await AuditAsync(actorId, target.Id, "user.assigned",
                request.AssignedEmployeeId is null ? "unassigned" : $"employee={request.AssignedEmployeeId}");
        }

        if (statusChanged)
        {
            target.IsActive = request.IsActive;
            await AuditAsync(actorId, target.Id, request.IsActive ? "user.activated" : "user.deactivated");
        }

        await db.SaveChangesAsync();
        return new UpdateUserResult(null, target);
    }

    public async Task<ResetPasswordResult> ResetPasswordAsync(string id, string actorId)
    {
        var target = await db.Users.FirstOrDefaultAsync(u => u.Id == id && u.DeletedAt == null);
        if (target is null)
        {
            return new ResetPasswordResult(ApiError.NotFound("user_not_found"), null);
        }

        var temporaryPassword = TempPasswords.Generate();
        target.MustChangePassword = true;
        await userManager.RemovePasswordAsync(target);
        var added = await userManager.AddPasswordAsync(target, temporaryPassword);
        if (!added.Succeeded)
        {
            return new ResetPasswordResult(UserAdministrationService.FromIdentityResult(added), null);
        }

        // Security-stamp rotation invalidates the user's existing sessions.
        await userManager.UpdateSecurityStampAsync(target);
        await AuditAsync(actorId, target.Id, "password.reset");
        await db.SaveChangesAsync();

        return new ResetPasswordResult(null, temporaryPassword);
    }

    public async Task<DeleteUserResult> DeleteAsync(string id, string actorId)
    {
        if (id == actorId)
        {
            return new DeleteUserResult(new ApiError("self_modification", "You cannot delete your own account."));
        }

        var target = await db.Users.FirstOrDefaultAsync(u => u.Id == id && u.DeletedAt == null);
        if (target is null)
        {
            return new DeleteUserResult(ApiError.NotFound("user_not_found"));
        }

        target.DeletedAt = DateTime.UtcNow;
        target.IsActive = false;
        await userManager.UpdateSecurityStampAsync(target);
        await AuditAsync(actorId, target.Id, "user.deleted");
        await db.SaveChangesAsync();
        return new DeleteUserResult(null);
    }

    private async Task AuditAsync(string actorId, string targetUserId, string action, string? note = null)
    {
        db.AdminAuditLogs.Add(new AdminAuditLog
        {
            At = DateTime.UtcNow,
            ActorUserId = actorId,
            TargetUserId = targetUserId,
            Action = action,
            Note = note,
        });
    }

    internal static ApiError FromIdentityResult(IdentityResult result)
    {
        var first = result.Errors.FirstOrDefault();
        return new ApiError(
            first?.Code ?? "invalid",
            string.IsNullOrWhiteSpace(first?.Description) ? "Validation failed." : first!.Description!);
    }
}
