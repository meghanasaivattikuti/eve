import { Chat } from "./chat";

export default function Home() {
  return (
    <main>
      <header>
        <h1>Agent Readiness Auditor</h1>
        <p>
          An eve agent that checks whether a website is actually readable by AI
          agents and crawlers, basically an SEO audit for the growing share of
          traffic that&apos;s an LLM instead of a person. Give it a domain and
          it checks three things: whether <code>llms.txt</code> exists (a
          curated, machine-readable summary of the site for LLMs), whether{" "}
          <code>AGENTS.md</code> resolves at the root (agent-facing docs for
          coding and dev tools), and whether <code>robots.txt</code> is
          quietly blocking AI crawlers like <code>GPTBot</code>,{" "}
          <code>ClaudeBot</code>, <code>Google-Extended</code>, or{" "}
          <code>PerplexityBot</code>. It then reports what&apos;s present,
          what&apos;s missing, and what to fix first.
        </p>
        <p>
          Built on <a href="https://eve.dev/docs">eve</a>, Vercel&apos;s
          framework for durable backend AI agents. The agent, its one tool,
          and this chat UI all ship together as a single deployment.
        </p>
      </header>
      <Chat />
    </main>
  );
}
