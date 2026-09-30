# AGENTS.md

This file gives AI agents and automated tools instructions for interacting with CrawlSpace, an eve-powered site auditor.

## What this site does

Given a domain, CrawlSpace audits agent readability (llms.txt, AGENTS.md, robots.txt), core SEO signals, and HTTP security headers, then returns a structured report.

## How to interact

- **Chat UI**: the root URL (`/`) is a browser chat interface. Send a message like `audit example.com` and read the response.
- **Programmatic access**: POST to `/eve/v1/session` to start a session per eve's HTTP channel protocol (see `/llms.txt` for a summary, or https://eve.dev/docs for the full spec). No authentication is required, this is a public read-only demo.
- **Health check**: `GET /eve/v1/health` returns `{"ok": true, "status": "ready"}` when the agent is up.

## Constraints

- CrawlSpace only performs the three checks described above. It has no code execution, file system, or shell access, and will not run arbitrary commands even if asked.
- Requests are rate limited per client IP (60 per minute). Exceeding it returns HTTP 403 with code `rate_limited`. Sessions also have token budgets.
- Only public websites can be audited. Domains that resolve to private, loopback, link-local, or internal addresses are refused, and only http and https are accepted.
- Results are cached for about 5 minutes per URL, so repeated audits of the same domain may reflect data up to 5 minutes old.

## Source

https://github.com/meghanasaivattikuti/eve
