using System.Security.Cryptography;
using Hanadicrochet.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Data;

/// <summary>
/// Admin bootstrap (plan 20261003-2126_admin-seed): guarantees that at least
/// one admin account exists. Idempotent — a no-op while any non-deleted
/// admin exists (self-heals after admins were soft-deleted). The initial
/// password is configured or generated, logged exactly once at creation,
/// and the account starts with <see cref="AppUser.MustChangePassword"/>,
/// so the owner picks their own at first login (plan 03 gate).
/// </summary>
public static class AdminSeeder
{
    /// <summary>Default admin login e-mail — IANA-reserved ".example" (never
    /// resolves); release 1 sends no e-mail (D13).</summary>
    public const string DefaultEmail = "admin@hanadicrochet.example";

    public static async Task SeedAsync(
        AppDbContext db,
        UserManager<AppUser> users,
        AdminSeedOptions options,
        ILogger logger,
        CancellationToken ct = default)
    {
        if (await db.Users.AnyAsync(u => u.IsAdmin && u.DeletedAt == null, ct))
        {
            return;
        }

        var email = string.IsNullOrWhiteSpace(options.Email)
            ? DefaultEmail
            : options.Email.Trim();
        var password = string.IsNullOrWhiteSpace(options.Password)
            ? GeneratePassword()
            : options.Password.Trim();

        var user = new AppUser
        {
            UserName = email,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = "Admin",
            Language = "en",
            IsAdmin = true,
            MustChangePassword = true,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        IdentityResult result;
        try
        {
            result = await users.CreateAsync(user, password);
        }
        catch (DbUpdateException)
        {
            // Unique-e-mail hit: another instance won the seed race — fine.
            if (await db.Users.AnyAsync(u => u.IsAdmin && u.DeletedAt == null, ct))
            {
                return;
            }
            throw;
        }

        if (!result.Succeeded)
        {
            var first = result.Errors.FirstOrDefault();
            throw new InvalidOperationException(
                $"AdminSeeder: cannot create the admin account '{email}': {first?.Description ?? first?.Code ?? "unknown error"}. "
                + "Check AdminSeed:Email (must be a free address) and AdminSeed:Password "
                + "(must satisfy the Identity password policy: 8+ chars, upper, lower, digit, symbol).");
        }

        logger.LogInformation(
            "Admin seeded: {Email} / {Password} — this password is logged only once; "
            + "log in at /staff/login and change it (forced on first login).",
            email, password);
    }

    /// <summary>
    /// 20-char cryptographically random password guaranteeing one character
    /// from each class (full default Identity policy), shuffled. Looks are
    /// excluded from the pools (l/1, 0/O) — it is typed by hand once.
    /// </summary>
    private static string GeneratePassword()
    {
        const string lower = "abcdefghijkmnopqrstuvwxyz";
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string digits = "23456789";
        const string symbols = "!@#$%^&*-_+=?";
        const string all = lower + upper + digits + symbols;
        const int length = 20;

        var chars = new List<char>
        {
            RandomNumberGenerator.GetString(lower, 1)[0],
            RandomNumberGenerator.GetString(upper, 1)[0],
            RandomNumberGenerator.GetString(digits, 1)[0],
            RandomNumberGenerator.GetString(symbols, 1)[0],
        };
        for (var i = chars.Count; i < length; i++)
        {
            chars.Add(RandomNumberGenerator.GetString(all, 1)[0]);
        }

        // Fisher–Yates: every position uniform, class guarantees preserved.
        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string([.. chars]);
    }
}
