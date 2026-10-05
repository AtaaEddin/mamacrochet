# hanadicrochet API test runner (plan 20261004-1823/01) — DEPLOY-PIPELINE ONLY.
#
# Build context is the REPO ROOT (see deploy/docker-compose.test.yml):
#   ./deploy/pipeline.sh
# The suite runs against the ephemeral `test-postgres` service; the fixture
# finds it via TEST_DB_HOST (set in the compose file) and creates/drops its
# own database. Nothing here persists.

FROM mcr.microsoft.com/dotnet/sdk:10.0-noble
WORKDIR /src
COPY . .
RUN dotnet build tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj
CMD ["dotnet", "test", "tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj", "--no-build", "--nologo"]
