# mamacrochet API (plan 10) — production image.
#
# Build context is the REPO ROOT (see deploy/docker-compose.yml):
#   docker build -f src/Mamacrochet.Api/Dockerfile .
# so Directory.Build.props is picked up by MSBuild like in dev builds.
# Multi-arch (amd64 + arm64): the official MCR images cover Raspberry Pi.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Project files first → the restore layer stays cached across source edits.
# (Context root = repo root, so projects live under src/.)
COPY Directory.Build.props ./
COPY src/Mamacrochet.Api/Mamacrochet.Api.csproj src/Mamacrochet.Api/
COPY src/Mamacrochet.ServiceDefaults/Mamacrochet.ServiceDefaults.csproj src/Mamacrochet.ServiceDefaults/
RUN dotnet restore src/Mamacrochet.Api/Mamacrochet.Api.csproj

COPY . .
# UseAppHost=false: no native apphost binary in the image (smaller, same runtime).
RUN dotnet publish src/Mamacrochet.Api/Mamacrochet.Api.csproj \
    -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8085
COPY --from=build /app/publish .
EXPOSE 8085
# TLS is terminated by Caddy; the API only ever sees plain HTTP on the
# compose network. Pending EF migrations are applied by the app on startup.
ENTRYPOINT ["dotnet", "Mamacrochet.Api.dll"]
