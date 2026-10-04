# COMMITS — 20261004-1823_deploy-pipeline-and-domain

| Date | Hash | Subject | Note |
|------|------|---------|------|
| 2026-10-04 | d74b8cf | docs(plans): deploy pipeline + Cloudflare domain plan — proposed (plan 20261004-1823) | Plan created (status: proposed): 01 pipeline (Dockerized API+UI tests → pre-deploy backup → volume-safe docker cleanup → deploy.sh → post-deploy prune), 02 Cloudflare domain (Registrar purchase owner-driven, DNS-only grey-cloud records for Caddy HTTP-01 Let's Encrypt, .env CADDY_SITE/MM_SITE_URL wiring, verification, optional orange-cloud + DNS-01 upgrade). Sources recorded in main.md. |
