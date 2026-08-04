# CrawlSpace

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
├── agent.ts                        # model config
├── instructions.md                 # the auditor's persona/system prompt
├── channels/
│   └── eve.ts                      # auth policy - currently none(), open for the demo
├── lib/
│   └── http.ts                     # shared fetchText() helper used by all three tools
└── tools/
    ├── audit_agent_readiness.ts    # llms.txt, AGENTS.md, robots.txt AI-crawler rules
    ├── check_seo.ts                # title/meta/OG tags, JSON-LD, sitemap.xml, render check
    ├── check_security_headers.ts   # HSTS, CSP, X-Frame-Options, etc.
    └── (11 disable files)          # ask_question.ts, bash.ts, glob.ts, grep.ts,
                                     # read_file.ts, write_file.ts, todo.ts, web_fetch.ts,
                                     # web_search.ts, load_skill.ts, agent.ts, see
                                     # "A note on tool access" below

app/                                 # Next.js App Router - the chat UI
├── layout.tsx                      # metadata: canonical URL, Open Graph, Twitter card, JSON-LD
├── page.tsx
├── chat.tsx                        # client component: useEveAgent, markdown rendering,
                                     # autoscroll, resumable sessions (see below)
├── globals.css
└── sitemap.ts                      # generates /sitemap.xml

public/
├── robots.txt                      # explicitly allows AI crawlers
├── llms.txt                        # curated summary of this site, for LLMs
└── AGENTS.md                       # agent-facing instructions for this site

next.config.ts                       # wraps the Next config with withEve(), also sets
                                      # security response headers
```

`agent/channels/eve.ts` uses `none()` for auth, meaning anyone with the link can use it, no login required. That's intentional for a public demo and should not stay that way if this ever does anything beyond serving a read-only audit tool.

## The chat UI

`app/chat.tsx` handles two things beyond the basic send/receive loop:

- **Autoscroll**: an effect calls `scrollIntoView` on a bottom sentinel as messages stream in, throttled to roughly once every 200ms so each smooth-scroll animation actually finishes instead of being restarted on every token and looking like a jumpy snap to the bottom.
- **Resumable sessions across a page refresh**: eve sessions are durable on the server already, a conversation survives fine on its own. The gap was that the browser had no memory of *which* session it had been using, so a refresh always started fresh. The fix follows eve's own documented "resumable sessions" pattern (`guides/frontend/overview`): after every turn, `onFinish` saves `session` (`sessionId`, `continuationToken`, `streamIndex`) and the rendered `events` log to `localStorage`. On mount, that gets read back and handed to `useEveAgent` as `initialSession`/`initialEvents`. The one adaptation from the docs' literal sample: reading `localStorage` can't happen in the same render that produces the server-rendered HTML (Next.js client components still render once on the server first), so loading happens in a `useEffect` instead, and the chat component remounts via a `key` once the saved session is available, since `useEveAgent`'s session config is only read once, when its internal store is created.

## Prerequisites

- **Node.js 24+** (eve requires it; check with `node --version`)
- A Vercel account with a card on file (for AI Gateway) or an Anthropic API key (see "Model setup" below)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure model credentials, see "Model setup" below, there are two ways to do this and the project currently uses the AI Gateway path.

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

`agent/instructions.md` controls report shape, not just tone: one verdict line, then per area (AEO, SEO, security headers) a table, a one-line summary, and a bullet per finding. Gaps get a slightly longer bullet than passes, but nothing runs more than a line or two, the report is built to be scanned, not read top to bottom. It also explicitly tells the model it has no code execution or shell access and must refuse rather than fabricate output if asked, see "A note on tool access" for why that instruction alone isn't the real fix.

## This site's own SEO and AEO setup

Running CrawlSpace against itself used to fail its own audit, no `llms.txt`, no `AGENTS.md`, no `robots.txt`, no canonical/OG/Twitter tags, no structured data, no sitemap, and only 1 of 6 security headers. Fixed now:

- `public/robots.txt`, `public/llms.txt`, `public/AGENTS.md` are served as static files at the site root.
- `app/sitemap.ts` generates `/sitemap.xml`.
- `app/layout.tsx` sets `metadataBase`, a canonical URL, Open Graph and Twitter card metadata, and a JSON-LD `WebApplication` block.
- `next.config.ts` sets `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` on every response. (HSTS comes from Vercel automatically.) The CSP relaxes `script-src` with `'unsafe-eval'` in development only, React dev mode needs it for better stack traces, production never gets it.

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

## Model setup

`agent/agent.ts` currently uses the AI Gateway path:

```ts
export default defineAgent({
  model: "anthropic/claude-sonnet-5",
});
```

A plain string model id always routes through Vercel's AI Gateway, authenticating via the linked Vercel project's OIDC token automatically (no manual key needed, locally or in production), as long as the project is linked (`eve link`, or any `eve deploy`). One real caveat: **AI Gateway requires a credit card on file for the Vercel team**, even to use the free credits. Without one, requests fail with a billing error, not an auth error, until a card is added at the Vercel AI settings page.

To use a direct Anthropic key instead (no Vercel billing requirement, but the key itself must be kept secret and rate-limited care is now on you):

```ts
import { anthropic } from "@ai-sdk/anthropic";

export default defineAgent({
  model: anthropic("claude-sonnet-5"),
});
```

...with `ANTHROPIC_API_KEY` set in `.env.local` locally and in the Vercel project's environment variables for production. The plain string form ignores `ANTHROPIC_API_KEY` even if it's set, and the `anthropic(...)` call form ignores AI Gateway entirely, they're mutually exclusive, pick one.

## A note on tool access

eve ships a set of **framework default tools**, available to any agent automatically unless explicitly disabled: `bash` (real shell execution), `read_file`, `write_file`, `glob`, `grep`, `web_fetch`, `web_search`, `todo`, `load_skill`, `ask_question`, and `agent` (subagent delegation). Authoring your own tools under `agent/tools/` does not remove these, they're additive. Run `eve info` or check `GET /eve/v1/info`'s `tools.available` list to see everything actually callable, not just what you wrote yourself, the CLI's short summary only counts authored tools and is misleading on its own.

This project explicitly disables all 11 of them (`agent/tools/bash.ts`, `agent/tools/write_file.ts`, etc., each exporting `disableTool()` from `eve/tools`), so the agent's only callable tools are the three audit tools it's meant to have. This matters specifically because the channel auth here is `none()`, a fully public, unauthenticated demo. Without disabling these, anyone with the link could have asked the agent to run arbitrary shell commands, read or write files, or fetch arbitrary URLs from the server, and it would have actually done it, not refused. A system prompt instruction telling the model "you have no code execution" is not a substitute for this and does not close the gap on its own: if a real tool is present in the model's tool list, prose in `instructions.md` doesn't remove the capability, only disabling the tool does.
