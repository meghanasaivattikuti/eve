import { defineTool } from "eve/tools";
import { z } from "zod";
import { isRealTextFile, resolveTarget, safeFetch } from "#lib/http.js";

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

function parseRobotsBlocking(robotsTxt: string) {
  const blocked = new Set<string>();
  let currentAgents: string[] = [];
  let lastWasAgent = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      // Consecutive User-agent lines share one rule group.
      currentAgents = lastWasAgent ? [...currentAgents, value] : [value];
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "disallow" && value === "/") {
      for (const agent of currentAgents) {
        const match = AI_BOT_USER_AGENTS.find((b) => b.toLowerCase() === agent.toLowerCase());
        if (match) blocked.add(match);
      }
    }
  }
  return [...blocked];
}

export default defineTool({
  description:
    "Audit a website for AI-agent readiness: checks llms.txt, AGENTS.md, and robots.txt rules for AI crawlers.",
  inputSchema: z.object({
    domain: z.string().min(1).describe("Domain or URL, e.g. example.com"),
  }),
  async execute({ domain }) {
    const target = await resolveTarget(domain);
    if (!target.ok) {
      return { domain, reachable: false, error: `Invalid or disallowed domain: ${target.error}` };
    }
    const { origin } = target;

    const [llms, agentsMd, robots] = await Promise.all([
      safeFetch(`${origin}/llms.txt`),
      safeFetch(`${origin}/AGENTS.md`),
      safeFetch(`${origin}/robots.txt`),
    ]);

    const robotsPresent = isRealTextFile(robots);
    const blockedBots = robotsPresent ? parseRobotsBlocking(robots.body) : [];

    return {
      domain: origin,
      llms_txt: { present: isRealTextFile(llms), url: `${origin}/llms.txt` },
      agents_md: { present: isRealTextFile(agentsMd), url: `${origin}/AGENTS.md` },
      robots_txt: {
        present: robotsPresent,
        blocked_ai_crawlers: blockedBots,
        checked_user_agents: AI_BOT_USER_AGENTS,
      },
    };
  },
});
