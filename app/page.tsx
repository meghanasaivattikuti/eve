import { Chat } from "./chat";

export default function Home() {
  return (
    <main>
      <header>
        <h1>Agent Readiness Auditor</h1>
        <p>
          Checks whether a website is actually readable by AI agents and
          crawlers, basically an SEO audit for the growing share of traffic
          that&apos;s an LLM instead of a person. Give it a domain and it
          reports what&apos;s present, what&apos;s missing, and what to fix
          first.
        </p>
        <dl className="checks">
          <div>
            <dt>llms.txt</dt>
            <dd>a curated, machine-readable summary of the site for LLMs</dd>
          </div>
          <div>
            <dt>AGENTS.md</dt>
            <dd>agent-facing docs for coding and dev tools, at the root</dd>
          </div>
          <div>
            <dt>robots.txt</dt>
            <dd>
              whether it&apos;s quietly blocking crawlers like GPTBot,
              ClaudeBot, Google-Extended, or PerplexityBot
            </dd>
          </div>
        </dl>
        <p className="footnote">
          Built on <a href="https://eve.dev/docs">eve</a>, Vercel&apos;s
          framework for durable backend AI agents.
        </p>
      </header>
      <Chat />
    </main>
  );
}
