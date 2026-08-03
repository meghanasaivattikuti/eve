import { Chat } from "./chat";

export default function Home() {
  return (
    <main>
      <header>
        <h1>CrawlSpace</h1>
        <p className="tagline">See your site the way a crawler does.</p>
        <p>
          Checks whether a website is actually readable by AI agents, and
          audits the SEO and security fundamentals while it&apos;s at it. Give
          it a domain and it reports what&apos;s present, what&apos;s missing,
          and what to fix first.
        </p>
        <dl className="checks">
          <div>
            <dt>Agent readability</dt>
            <dd>
              llms.txt, AGENTS.md, and whether robots.txt is quietly blocking
              crawlers like GPTBot, ClaudeBot, or PerplexityBot
            </dd>
          </div>
          <div>
            <dt>SEO</dt>
            <dd>
              title, meta description, canonical URL, Open Graph tags,
              structured data, sitemap.xml, and whether content is actually
              server-rendered
            </dd>
          </div>
          <div>
            <dt>Security headers</dt>
            <dd>
              HSTS, Content-Security-Policy, X-Frame-Options, and other
              standard response headers
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
