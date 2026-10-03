namespace Hanadicrochet.Api.Models;

/// <summary>
/// Admin bootstrap configuration (plan 20261003-2126_admin-seed). Both keys
/// are optional: blank/absent email → <see cref="AdminSeeder.DefaultEmail"/>,
/// blank/absent password → a strong random password is generated.
/// </summary>
public sealed class AdminSeedOptions
{
    public const string SectionName = "AdminSeed";

    /// <summary>Login e-mail for the seeded admin.</summary>
    public string? Email { get; set; }

    /// <summary>Initial password for the seeded admin.</summary>
    public string? Password { get; set; }
}
