# Agent Readiness Auditor

A small [eve](https://eve.dev) agent that audits whether a website is actually readable by AI agents and crawlers - the "AEO" (agent-experience-optimization) equivalent of an SEO audit.

Give it a domain and it checks:

- **`llms.txt`** - is there a machine-readable summary of the site for LLMs?
- **`AGENTS.md`** - is there agent-facing documentation at the root?
- **`robots.txt`** - is it blocking known AI crawlers (`GPTBot`, `ClaudeBot`, `Google-Extended`, `PerplexityBot`, `CCBot`, `Bytespider`, etc.)?

It reports what's present, what's missing, and what to fix first. There's a browser chat UI on top now (not just the CLI), live at https://eve-orcin-six.vercel.app.

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
└── tools/
    └── audit_agent_readiness.ts    # the one tool: fetches + parses
                                     # llms.txt, AGENTS.md, robots.txt

app/                                 # Next.js App Router - the chat UI
├── layout.tsx
├── page.tsx
├── chat.tsx                        # client component, uses eve/react's useEveAgent
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

The agent calls `audit_agent_readiness`, then summarizes what it found. `Ctrl+C` stops the server; restart with `npm run dev` any time you change `agent/agent.ts` (env file changes reload automatically without a restart).

## Testing without the browser

```bash
npx eve invoke "audit vercel.com"
```

Runs one turn against a fresh local instance, no UI, prints the result as JSON. Useful for checking the tool logic without going through the chat UI.

## How the tool works

`agent/tools/audit_agent_readiness.ts` takes a `domain`, then in parallel:

1. Fetches `/llms.txt` and checks if it exists.
2. Fetches `/AGENTS.md` and checks if it exists.
3. Fetches `/robots.txt` and parses it for `Disallow: /` rules scoped to known AI-crawler user-agents.

It returns a structured JSON report; the model (guided by `agent/instructions.md`) turns that into a plain-language summary with concrete recommendations.

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
