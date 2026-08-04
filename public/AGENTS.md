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
- Rate limits are not enforced. Please be a reasonable citizen if scripting against this endpoint.

## Source

https://github.com/meghanasaivattikuti/eve
