# Agent Readiness Auditor

A small [eve](https://eve.dev) agent that audits a website across three areas: whether it's actually readable by AI agents and crawlers ("AEO"), core SEO fundamentals, and HTTP security headers.

Give it a domain and it checks:

- **Agent readability**: `llms.txt` (a machine-readable summary of the site for LLMs), `AGENTS.md` (agent-facing docs at the root), and whether `robots.txt` is blocking known AI crawlers (`GPTBot`, `ClaudeBot`, `Google-Extended`, `PerplexityBot`, `CCBot`, `Bytespider`, etc.).
- **SEO**: title, meta description, canonical URL, Open Graph/Twitter tags, structured data (JSON-LD), `sitemap.xml`, and whether the page has meaningful server-rendered content (vs. an empty client-side-rendered shell).
- **Security headers**: HSTS, Content-Security-Policy, X-Frame-Options, Referrer-Policy, X-Content-Type-Options, Permissions-Policy.

It reports what's present, what's missing, and what to fix first, across all three. Browser chat UI, live at https://eve-virid-eight.vercel.app.

## What is eve?

[eve](https://eve.dev) is a framework from Vercel for building durable, backend AI agents. The core idea: **an agent is just a TypeScript project** and eve discovers what your agent can do by where you put files, not by config you write by hand.

- `agent/instructions.md` - the agent's system prompt / persona. Always-on context the model sees every turn.
- `agent/agent.ts` - runtime config: which model to use, limits, etc.
- `agent/tools/*.ts` - typed functions the model can call. Each file exports a `defineTool(...)`, and **the filename becomes the tool name**, so no separate registration step. `agent/tools/audit_agent_readiness.ts` becomes the `audit_agent_readiness` tool automatically.
- `agent/channels/*.ts` - entry points the agent is reachable through (HTTP, the local dev TUI, messaging platforms, etc.).
- `agent/skills/`, `agent/connections/`, `agent/subagents/`, `agent/schedules/` - other capability types (procedures, MCP/OpenAPI integrations, delegated sub-agents, recurring jobs) that this project doesn't currently use.

eve runs the agent as a durable backend service, independent of any one browser tab or terminal session.

## How this project is put together

This started as a plain eve project (CLI TUI only). A Next.js frontend was bolted on afterward using eve's `withEve()` integration, so the agent and the chat UI now ship as a single Vercel deployment instead of needing the eve CLI to talk to it.

```
agent/
├── agent.ts                        # model config (direct Anthropic provider)
├── instructions.md                 # the auditor's persona/system prompt
├── channels/
│   └── eve.ts                      # auth policy - currently none(), open for the demo
├── lib/
│   └── http.ts                     # shared fetchText() helper used by all three tools
└── tools/
    ├── audit_agent_readiness.ts    # llms.txt, AGENTS.md, robots.txt AI-crawler rules
    ├── check_seo.ts                # title/meta/OG tags, JSON-LD, sitemap.xml, render check
    └── check_security_headers.ts   # HSTS, CSP, X-Frame-Options, etc.

app/                                 # Next.js App Router - the chat UI
├── layout.tsx
├── page.tsx
├── chat.tsx                        # client component, uses eve/react's useEveAgent,
                                     # renders markdown responses with react-markdown
└── globals.css

next.config.ts                       # wraps the Next config with withEve()
```

`agent/channels/eve.ts` uses `none()` for auth, meaning anyone with the link can use it, no login required. That's intentional for a public demo and should not stay that way if this ever does anything beyond serving a read-only audit tool.

## Prerequisites

- **Node.js 24+** (eve requires it; check with `node --version`)
- An Anthropic API key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Add your Anthropic key to `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   `agent/agent.ts` calls Anthropic directly via `@ai-sdk/anthropic` rather than through Vercel's AI Gateway, so this key is all you need - no Vercel account or gateway key required.

## Run it

```bash
npm run dev
```

`next dev` boots and starts eve's dev server alongside it automatically. Open `http://localhost:3000` and type something into the chat box, e.g.:

```
audit vercel.com
```

The agent calls all three tools, then summarizes what it found. `Ctrl+C` stops the server; restart with `npm run dev` any time you change `agent/agent.ts` (env file changes reload automatically without a restart).

## Testing without the browser

```bash
npx eve invoke "audit vercel.com"
```

Runs one turn against a fresh local instance, no UI, prints the result as JSON. Useful for checking the tool logic without going through the chat UI.

## How the tools work

All three tools take a `domain` and return a structured JSON report; the model (guided by `agent/instructions.md`) always calls all three, then turns the combined results into one plain-language report with concrete recommendations.

- **`audit_agent_readiness.ts`**: fetches `/llms.txt`, `/AGENTS.md`, and `/robots.txt` in parallel, and parses robots.txt for `Disallow: /` rules scoped to known AI-crawler user-agents.
- **`check_seo.ts`**: fetches the page HTML and `/sitemap.xml`, then regex-extracts `<title>`, meta description, canonical URL, Open Graph/Twitter tags, and JSON-LD structured data blocks. Also estimates visible text length in the raw HTML as a rough server-rendered-vs-empty-shell signal.
- **`check_security_headers.ts`**: fetches the page and reads response headers directly, no parsing needed.

No HTML parsing library is used, just regex, to keep dependencies minimal. It's good enough for real-world pages but will miss edge cases a real parser wouldn't (e.g. attributes split across multiple lines in unusual ways).

`agent/instructions.md` controls report shape, not just tone: one verdict line, then per area (AEO, SEO, security headers) a table, a one-line summary, and a bullet per finding. Gaps get a slightly longer bullet than passes, but nothing runs more than a line or two, the report is built to be scanned, not read top to bottom.

## Evals

```bash
npx eve eval
```

Runs the two evals under `evals/` against a fresh local instance: `full-audit.eval.ts` sends a real audit request and asserts all three tools got called, `no-tools-for-chitchat.eval.ts` sends a message with no domain in it and asserts none of them fired. These are regression checks, if a future instructions.md or tool change breaks the "always audit, never tool-call on chitchat" behavior, `eve eval` catches it instead of you finding out from a weird transcript.

## Deploying

```bash
npx eve deploy
```

Links the Vercel project if it isn't already, runs `vercel deploy --prod`, and pulls env vars back down afterward. Running `/deploy` from inside the dev TUI can hang on an unrelated interactive prompt ("install Vercel Plugin for Claude Code?"); if that happens, just run `npx eve deploy` directly in a terminal instead.

## Model setup, if starting from scratch

`agent/agent.ts` calls Anthropic directly:

```ts
import { anthropic } from "@ai-sdk/anthropic";

export default defineAgent({
  model: anthropic("claude-sonnet-5"),
});
```

By default, eve's init wizard sets `model` to a plain string like `"anthropic/claude-sonnet-5"`, which always routes through Vercel's AI Gateway (needs `AI_GATEWAY_API_KEY` or a linked Vercel project). To use a direct Anthropic key instead, you need the `anthropic(...)` call form above - the plain string form ignores `ANTHROPIC_API_KEY` even if it's set.

## Other useful commands

| Command | What it does |
|---|---|
| `npm run typecheck` | Type-checks the whole project with `tsc` |
| `npx eve invoke "audit stripe.com"` | Runs the agent once, no UI - good for scripting |
| `npx eve logs` | Inspects local dev diagnostic logs (`.eve/logs`) |
