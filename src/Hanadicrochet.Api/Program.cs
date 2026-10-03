using Hanadicrochet.Api.Authorization;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Endpoints;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;
using System.Net;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// Aspire service defaults: OpenTelemetry (logs/metrics/traces to the dashboard),
// health checks, service discovery, HttpClient resilience.
builder.AddServiceDefaults();

builder.Services.AddOpenApi(options =>
{
    // Expose the /health response schema in the OpenAPI document so the
    // generated frontend client (pnpm gen:api) is fully typed.
    options.AddOperationTransformer(async (operation, context, ct) =>
    {
        if (operation.OperationId != "Health")
        {
            return;
        }

        var schema = await context.GetOrCreateSchemaAsync(typeof(ApiHealth), null, ct);
        context.Document?.AddComponent("ApiHealth", schema);
        operation.Responses ??= new OpenApiResponses();
        operation.Responses["200"] = new OpenApiResponse
        {
            Description = "OK",
            Content = new Dictionary<string, OpenApiMediaType>
            {
                [
                    "application/json"] = new()
                {
                    Schema = new OpenApiSchemaReference("ApiHealth", context.Document),
                },
            },
        };
    });

    // Standard error envelope: every request can fail with any of these, and
    // every failure body is ApiError JSON (400 validation, 401 unauthenticated,
    // 403 forbidden, 404 not found, 409 conflict, 423 locked, 429 rate limited,
    // 500 server error). Declaring them on every operation makes the generated
    // client type `error` as ApiError on every call. Success bodies are declared
    // per endpoint with WithResults. (The binary file endpoints are excluded:
    // their 404 is an empty body, handled by the transformer below.)
    options.AddOperationTransformer(async (operation, context, ct) =>
    {
        if (operation.OperationId is "Health" or "files.getAvatar" or "files.getProductImage" or "files.getOrderFile" or "files.getChatFile")
        {
            return;
        }

        operation.Responses ??= new OpenApiResponses();
        var errorSchema = await context.GetOrCreateSchemaAsync(typeof(ApiError), null, ct);
        context.Document?.AddComponent("ApiError", errorSchema);
        foreach (var code in new[] { "400", "401", "403", "404", "409", "423", "429", "500" })
        {
            operation.Responses[code] = new OpenApiResponse
            {
                Description = $"Error {code}",
                Content = new Dictionary<string, OpenApiMediaType>
                {
                    [
                        "application/json"] = new()
                    {
                        Schema = new OpenApiSchemaReference("ApiError", context.Document),
                    },
                },
            };
        }
    });

    // Binary files (avatar, product images, hiring proofs): 200 = the bytes,
    // 404 = empty (no JSON envelope). Rate limiting and server errors still
    // return the ApiError JSON envelope.
    options.AddOperationTransformer(async (operation, context, ct) =>
    {
        if (operation.OperationId is not
            ("files.getAvatar" or "files.getProductImage" or "files.getHiringFile" or "files.getOrderFile" or "files.getChatFile"))
        {
            return;
        }

        operation.Responses ??= new OpenApiResponses();
        operation.Responses["200"] = new OpenApiResponse
        {
            Description = "The file.",
            Content = new Dictionary<string, OpenApiMediaType>
            {
                [
                    "image/*"] = new()
                {
                    Schema = new OpenApiSchema { Type = JsonSchemaType.String, Format = "binary" },
                },
                // Hiring proofs may also be PDFs; avatars are images only —
                // the extra media type is harmless for both.
                [
                    "application/pdf"] = new()
                {
                    Schema = new OpenApiSchema { Type = JsonSchemaType.String, Format = "binary" },
                },
            },
        };
        operation.Responses["404"] = new OpenApiResponse
        {
            Description = "File not found.",
        };

        var errorSchema = await context.GetOrCreateSchemaAsync(typeof(ApiError), null, ct);
        context.Document?.AddComponent("ApiError", errorSchema);
        foreach (var code in new[] { "429", "500" })
        {
            operation.Responses[code] = new OpenApiResponse
            {
                Description = $"Error {code}",
                Content = new Dictionary<string, OpenApiMediaType>
                {
                    [
                        "application/json"] = new()
                    {
                        Schema = new OpenApiSchemaReference("ApiError", context.Document),
                    },
                },
            };
        }
    });

    // OData-style query subset (plan 04, D19) on the QuerySpec-backed list
    // endpoints: the binder reads $top/$skip/$filter/$orderby from the raw
    // query string, so the document must declare them for a typed client.
    // The fields allowed in $filter are per-endpoint (the binder's allowlist).
    options.AddOperationTransformer((operation, context, ct) =>
    {
        if (operation.OperationId is not
            ("orders.list" or "staff.orders.list" or "admin.orders.list" or "staff.products.list" or "catalog.products.list"))
        {
            return Task.CompletedTask;
        }

        operation.Parameters ??= new List<IOpenApiParameter>();
        operation.Parameters.Add(new OpenApiParameter
        {
            Name = "$top",
            In = ParameterLocation.Query,
            Required = false,
            Description = "Page size (items per page).",
            Schema = new OpenApiSchema { Type = JsonSchemaType.Integer },
        });
        operation.Parameters.Add(new OpenApiParameter
        {
            Name = "$skip",
            In = ParameterLocation.Query,
            Required = false,
            Description = "Number of items to skip.",
            Schema = new OpenApiSchema { Type = JsonSchemaType.Integer },
        });
        operation.Parameters.Add(new OpenApiParameter
        {
            Name = "$filter",
            In = ParameterLocation.Query,
            Required = false,
            Description = "OData v4.01 filter (fields restricted by the endpoint allowlist).",
            Schema = new OpenApiSchema { Type = JsonSchemaType.String },
        });
        operation.Parameters.Add(new OpenApiParameter
        {
            Name = "$orderby",
            In = ParameterLocation.Query,
            Required = false,
            Description = "Sort, e.g. \"createdAt desc\".",
            Schema = new OpenApiSchema { Type = JsonSchemaType.String },
        });

        return Task.CompletedTask;
    });
});

var connectionString = builder.Configuration.GetConnectionString("hanadicrochet")
    ?? throw new InvalidOperationException("Connection string 'hanadicrochet' is not configured.");

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

// Identity (plan 03): cookie auth for the first-party web + same-origin API.
// Dev runs cross-origin-but-same-site (localhost:3000 → localhost:8085), so
// SameSite=Lax still delivers the cookie; Secure is dropped over plain HTTP
// in dev (SameAsRequest) and enforced in prod behind Caddy's TLS.
builder.Services
    .AddIdentity<AppUser, IdentityRole>(options =>
    {
        // ASP.NET Identity defaults (documented here on purpose).
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = true;
        options.Lockout.AllowedForNewUsers = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
    })
    .AddEntityFrameworkStores<AppDbContext>();

// .NET 10 moved the cookie out of IdentityOptions: configure the
// application (auth) cookie through the dedicated builder extension, with
// the cookie itself a CookieBuilder property.
builder.Services.ConfigureApplicationCookie(cookie =>
{
    cookie.Cookie.Name = "hc.auth";
    cookie.Cookie.Path = "/";
    cookie.Cookie.HttpOnly = true;
    cookie.Cookie.SameSite = SameSiteMode.Lax;
    cookie.Cookie.MaxAge = TimeSpan.FromDays(14);
    cookie.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
    cookie.SlidingExpiration = true;

    // .NET 10 returns 401/403 with an EMPTY body for "known API" endpoints
    // (those with IApiEndpointMetadata) instead of redirecting, and would
    // still 302-redirect the rest. Overriding these events restores a single
    // typed-response path for every protected endpoint (plan 03 contract).
    cookie.Events.OnRedirectToLogin = async ctx =>
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await ctx.Response.WriteAsJsonAsync(
            new ApiError("unauthenticated", "Sign in to continue."));
    };
    cookie.Events.OnRedirectToAccessDenied = async ctx =>
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        await ctx.Response.WriteAsJsonAsync(
            new ApiError("forbidden", "You do not have permission to do this."));
    };
});

builder.Services
    .AddAuthorization(options =>
    {
        // .NET 10 dropped RequirePolicy, so each policy states its requirements
        // directly; the ActiveUserRequirement is what they all share.
        options.AddPolicy(Policies.Any, p =>
            p.RequireAuthenticatedUser().AddRequirements(new ActiveUserRequirement()));
        options.AddPolicy(Policies.Customer, p =>
            p.RequireAuthenticatedUser().AddRequirements(new ActiveUserRequirement()));
        options.AddPolicy(Policies.Employee, p =>
            p.RequireAuthenticatedUser()
                .AddRequirements(new ActiveUserRequirement(), new RoleFlagRequirement(Policies.RoleEmployee)));
        options.AddPolicy(Policies.Admin, p =>
            p.RequireAuthenticatedUser()
                .AddRequirements(new ActiveUserRequirement(), new RoleFlagRequirement(Policies.RoleAdmin)));
    })
    .AddScoped<IAuthorizationHandler, ActiveUserAuthorizationHandler>()
    .AddScoped<UserAdministrationService>()
    .AddScoped<GuestLinkService>()
    .AddScoped<ProductAdministrationService>()
    .AddScoped<HiringService>()
    .AddScoped<OrderService>()
    .AddScoped<ChatService>()
    .AddSingleton<ChatTokenService>();

builder.Services.Configure<ChatTokenOptions>(builder.Configuration.GetSection("Chat"));
builder.Services.AddHostedService<OrderSweepService>();
builder.Services.AddHostedService<ChatSweepService>();

builder.Services.Configure<UploadsOptions>(builder.Configuration.GetSection(UploadsOptions.SectionName));

builder.Services.AddAntiforgery(options => options.HeaderName = "X-CSRF-TOKEN");

// Plan 06: chat realtime (D7) — the /hubs/chat SignalR hub.
builder.Services.AddSignalR();

// Rate limits (D16 step 1 — guest caps land in plans 05/06): a tight budget
// on auth/admin flows, a generous default. Partitioned per client IP.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, ct) =>
    {
        var response = context.HttpContext.Response;
        response.ContentType = "application/json";
        await response.WriteAsJsonAsync(
            new ApiError("rate_limited", "Too many requests — please try again in a minute."),
            ct);
    };

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var path = context.Request.Path;
        // Public guest submits (hiring, order creation — plan 09/05) are
        // guest-mutable actions: the strict guest budget, not the default.
        var isGuestSubmit = (path == "/orders" && context.Request.Method == HttpMethods.Post)
            || (path == "/chat/visitor" && context.Request.Method == HttpMethods.Post)
            || path.StartsWithSegments("/hiring");
        var inAuthArea = path.StartsWithSegments("/identity")
            || path.StartsWithSegments("/admin");
        // The strict budget is for auth/admin ACTIONS (login, register,
        // mutations). Reading one's own profile is part of every page load
        // (header badge + account pages) and belongs to the default budget,
        // otherwise a normal session 429s itself mid-minute.
        var isOwnProfileRead = context.Request.Method == HttpMethods.Get
            && path == "/identity/me";
        var isAuthAction = inAuthArea && !isOwnProfileRead;
        (var bucket, var permitLimit) = isGuestSubmit
            ? ("guest", 5)
            : isAuthAction
                ? ("auth", 30)
                : ("default", 300);
        return RateLimitPartition.GetFixedWindowLimiter(
            $"{ip}:{bucket}",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            });
    });
});

// The browser talks to the API cross-origin in dev (Next dev server on its own
// port). The allowed origins are injected by the AppHost from the web endpoint.
var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    // AllowCredentials: cookie auth (plan 03) — the browser only sends the
    // hc.auth cookie cross-origin when the response opts in.
    policy.AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    if (corsOrigins.Length > 0)
    {
        policy.WithOrigins(corsOrigins);
    }
    else
    {
        // Standalone dev (no AppHost): allow localhost origins of any port.
        policy.WithOrigins(
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001");
    }
}));

// Production error envelope (plan 03). The registration MUST happen before
// Build(): the service collection is read-only afterwards, and the prod
// branch crashed at startup (caught by the plan 10 Docker smoke test).
// AddProblemDetails is required by .NET 10 for the parameterless
// UseExceptionHandler() (it also provides the fallback for exceptions our
// handler does not claim, which is none in practice).
if (!builder.Environment.IsDevelopment())
{
    builder.Services.AddExceptionHandler<ApiExceptionHandler>();
    builder.Services.AddProblemDetails();
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseExceptionHandler();
}

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

// Plan 10: in production the app runs behind Caddy, which terminates TLS and
// sets X-Forwarded-For/-Proto. Honouring them keeps client IPs correct (rate
// limiting, guest caps) and Secure cookies settable. In compose ONLY the
// caddy container can reach the api (its port is not published), and Docker
// allocates compose networks from 172.16.0.0/12 — so the whole bridge range
// is our proxy. Dev has no such proxy and keeps its direct behaviour.
if (!app.Environment.IsDevelopment())
{
    app.UseForwardedHeaders(new ForwardedHeadersOptions
    {
        // .NET 10 API (KnownNetworks/IPAddressRange is deprecated): IPNetwork.
        KnownIPNetworks = { IPNetwork.Parse("172.16.0.0/12") },
    });
}

app.UseCors();
app.UseRateLimiter();

// TLS is terminated by the reverse proxy (Caddy in prod, plan 10); the dev
// proxy from Aspire speaks plain HTTP, so no https redirection here.
app.UseAuthentication();
app.UseAuthorization();

// Built-in antiforgery middleware: required by endpoints that receive form
// data (e.g. product image uploads) — the framework marks those endpoints
// with anti-forgery metadata and refuses to run them without it. It only
// validates metadata-marked (form) endpoints; JSON mutations are covered by
// the path-scoped middleware below (plan 03).
app.UseAntiforgery();

// CSRF validation must run AFTER authentication: .NET 10 antiforgery tokens
// are scoped to the authenticated principal, so validation has to see the
// same HttpContext.User that issued the token (plan 03).
app.UseApiAntiforgery();

IdentityEndpoints.MapIdentityEndpoints(app);
AdminUserEndpoints.MapAdminUserEndpoints(app);
CatalogEndpoints.MapCatalogEndpoints(app);
StaffProductEndpoints.MapStaffProductEndpoints(app);
StaffCustomerEndpoints.MapStaffCustomerEndpoints(app);
HiringEndpoints.MapHiringEndpoints(app, app.Services.GetRequiredService<IOptions<UploadsOptions>>());
OrderEndpoints.MapOrderEndpoints(app, app.Services.GetRequiredService<IOptions<UploadsOptions>>());
ChatEndpoints.MapChatEndpoints(app);
// Plan 06: chat realtime (D7) — cookie auth for users, thread tokens (D14)
// via the negotiate query string for visitor threads.
app.MapHub<Hanadicrochet.Api.Hubs.ChatHub>("/hubs/chat");
FileEndpoints.MapFileEndpoints(app, app.Services.GetRequiredService<IOptions<UploadsOptions>>());

app.MapGet("/health", (AppDbContext db) =>
{
    return Results.Ok(new ApiHealth(
        Status: "ok",
        Database: db.Database.CanConnect() ? "connected" : "unavailable"));
})
.WithName("Health");

// Liveness from the service defaults. We do NOT call MapDefaultEndpoints():
// it would remap /health as a generic text health check, while the JSON
// /health above (with the live DB check) is the contract the frontend pill
// and the deploy health probes use.
app.MapHealthChecks("/alive", new HealthCheckOptions
{
    Predicate = r => r.Tags.Contains("live"),
});

// Plan 10: single-instance deployment — apply pending EF Core migrations on
// startup. Migrate() is idempotent (a no-op when the schema is current), so
// every (re)start is safe; compose gates this on a healthy postgres.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    // Plan 04: starter catalog (4 categories + 6 sample pieces). Idempotent —
    // a no-op once seeded.
    await CatalogSeeder.SeedAsync(db);
}

app.Run();

/// <summary>
/// CSRF check for cookie-auth state-changing API requests (plan 03). The
/// frontend fetches a token from GET /antiforgery and sends it in the
/// X-CSRF-TOKEN header; GETs and everything outside /identity, /admin,
/// /staff and /orders are untouched. The public POST /orders guest submit
/// and /hiring are exempt (rate limit + honeypot + caps). SignalR paths
/// join the exclusion list in plan 06.
/// </summary>
public static class AntiforgeryMiddleware
{
    public static IApplicationBuilder UseApiAntiforgery(this IApplicationBuilder app)
    {
        return app.Use(async (context, next) =>
        {
            var request = context.Request;
            // /orders joins the CSRF area (customer cancel/rating), EXCEPT
            // the public POST /orders guest submit: rate-limited + honeypot
            // + D16 caps instead (same precedent as /hiring).
            var inCsrfArea = request.Path.StartsWithSegments("/identity")
                || request.Path.StartsWithSegments("/admin")
                || request.Path.StartsWithSegments("/staff")
                || request.Path.StartsWithSegments("/orders")
                || request.Path.StartsWithSegments("/chat");
            // Exemptions: the public guest submit (rate limit + honeypot +
            // per-device caps instead) and every X-Chat-Token request (the
            // endpoint requires a valid, unforgeable-by-CSRF-attackers
            // thread token — the guest has no cookie identity to ride).
            var isGuestOrderSubmit = request.Path == "/orders"
                && HttpMethods.IsPost(request.Method);
            var isGuestChatBootstrap = request.Path == "/chat/visitor"
                && HttpMethods.IsPost(request.Method);
            var hasChatToken = request.Headers.ContainsKey("X-Chat-Token");
            if (inCsrfArea && !isGuestOrderSubmit && !isGuestChatBootstrap && !hasChatToken
                && (HttpMethods.IsPost(request.Method)
                    || HttpMethods.IsPut(request.Method)
                    || HttpMethods.IsDelete(request.Method)
                    || request.Method == HttpMethods.Patch))
            {
                try
                {
                    var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
                    await antiforgery.ValidateRequestAsync(context);
                }
                catch (AntiforgeryValidationException)
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsJsonAsync(
                        new ApiError("csrf", "Your session expired. Please try again."));
                    return;
                }
            }

            await next();
        });
    }
}

/// <summary>Production error envelope — never leak exception details (plan 03).</summary>
public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (context.Response.HasStarted)
        {
            return false;
        }

        logger.LogError(exception, "Request {Path} {Method} failed", context.Request.Path, context.Request.Method);
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(
            new ApiError("server_error", "Something went wrong."), cancellationToken);
        return true;
    }
}
