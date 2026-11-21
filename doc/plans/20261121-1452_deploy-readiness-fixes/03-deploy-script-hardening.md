# 03 — Deploy script hardening

status: done

## Problem A — line endings

There is no `.gitattributes`, and this Windows working tree checks out with `core.autocrlf=true`.
Committed blobs are LF (verified: `git ls-files --eol`), so `git clone` on the Pi is safe —
but any **copy** of the working tree (scp, zip, shared folder over remote desktop) carries
CRLF, and every `#!/usr/bin/env bash` script then dies with `bad interpreter: bash^M`.

## Change

Add `.gitattributes` forcing LF for the files that are executed or parsed on Linux:
`*.sh`, `*.env*`, `Dockerfile*`, `Caddyfile`, `*.yml`/`*.yaml`. Then re-checkout those paths
so this tree is LF too.

## Problem B — wrong base image tag

`deploy/pipeline.sh` pre-pulls `mcr.microsoft.com/dotnet/sdk:10.0-noble`, while
`src/Hanadicrochet.Api/Dockerfile` builds `FROM mcr.microsoft.com/dotnet/sdk:10.0`
(and `tests/.../Dockerfile` uses `-noble`). On a Pi over a slow link the "warm the bases"
phase therefore does not warm the image the API build actually needs — a fresh ~1 GB pull
inside `pipeline.sh`.

## Change

Use `mcr.microsoft.com/dotnet/sdk:10.0` in all three places (pipeline, API Dockerfile,
test Dockerfile): one tag, one pull, still patched automatically.

## Verification

- `git ls-files --eol deploy …` → `i/lf w/lf attr/text eol=lf` for every script, the
  compose files, the Caddyfile, `.env.example` and all three Dockerfiles (the working
  tree was re-checked out with LF).
- `grep` finds exactly one SDK tag (`mcr.microsoft.com/dotnet/sdk:10.0`) across
  `deploy/pipeline.sh`, `src/Hanadicrochet.Api/Dockerfile` and
  `tests/Hanadicrochet.Api.Tests/Dockerfile`.
