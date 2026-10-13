# COMMITS — 20261013-1545_windows11-hosting

| Date | Hash | Subject | Note |
|------|------|---------|------|
| 2026-10-13 | — | docs(plans): Windows 11 hosting plan — proposed (plan 20261013-1545) | Plan created (status: proposed): Docker Desktop on WSL 2 backend reuses the verified 4-container stack + deploy/ scripts unchanged; 01 machine setup (WSL2, Docker Desktop, .wslconfig cap, firewall, power, auto-start), 02 deploy/backup/restore on Windows (LF .gitattributes guard, Task Scheduler daily backup, restore drill), 03 public domain + HTTPS (router forward, firewall 443, Caddy Let's Encrypt, outside-LAN verification). Native Windows hosting (IIS/WinSW/NSSM + caddy.exe) evaluated and rejected (W7). Sources recorded in main.md. |
