import { defineTool } from "eve/tools";
import { z } from "zod";
import { isRealTextFile, resolveTarget, safeFetch } from "#lib/http.js";
import { AI_BOT_USER_AGENTS, findBlockedAiCrawlers } from "#lib/robots.js";

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
    const blockedBots = robotsPresent ? findBlockedAiCrawlers(robots.body) : [];

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
