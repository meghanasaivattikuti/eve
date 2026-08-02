import { defineTool } from "eve/tools";
import { z } from "zod";

const AI_BOT_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "CCBot",
  "Bytespider",
];

async function fetchText(url: string) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return { ok: false, status: res.status, body: null };
    return { ok: true, status: res.status, body: await res.text() };
  } catch {
    return { ok: false, status: null, body: null };
  }
}

function parseRobotsBlocking(robotsTxt: string) {
  const lines = robotsTxt.split("\n").map((l) => l.trim());
  const blocked: string[] = [];
  let currentAgents: string[] = [];

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      currentAgents = [value];
    } else if (key === "disallow" && value === "/") {
      for (const agent of currentAgents) {
        if (AI_BOT_USER_AGENTS.some((b) => b.toLowerCase() === agent.toLowerCase())) {
          blocked.push(agent);
        }
      }
    }
  }
  return blocked;
}

export default defineTool({
  description:
    "Audit a website for AI-agent readiness: checks llms.txt, AGENTS.md, and robots.txt rules for AI crawlers.",
  inputSchema: z.object({
    domain: z.string().min(1).describe("Domain or URL, e.g. example.com"),
  }),
  async execute({ domain }) {
    const base = domain.startsWith("http") ? domain : `https://${domain}`;
    const origin = new URL(base).origin;

    const [llms, agentsMd, robots] = await Promise.all([
      fetchText(`${origin}/llms.txt`),
      fetchText(`${origin}/AGENTS.md`),
      fetchText(`${origin}/robots.txt`),
    ]);

    const blockedBots = robots.ok && robots.body ? parseRobotsBlocking(robots.body) : [];

    return {
      domain: origin,
      llms_txt: { present: llms.ok, url: `${origin}/llms.txt` },
      agents_md: { present: agentsMd.ok, url: `${origin}/AGENTS.md` },
      robots_txt: {
        present: robots.ok,
        blocked_ai_crawlers: blockedBots,
        checked_user_agents: AI_BOT_USER_AGENTS,
      },
    };
  },
});
