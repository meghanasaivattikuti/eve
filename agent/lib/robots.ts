export const AI_BOT_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "CCBot",
  "Bytespider",
];

type Group = { agents: string[]; disallowAll: boolean; allowAll: boolean };

// `/` and `/*` (and `/$`-less wildcards of the whole site) cover the entire site.
const isWholeSite = (path: string) => path === "/" || path === "/*";

function parseGroups(robotsTxt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      // Consecutive User-agent lines share one rule group.
      if (!lastWasAgent || !current) {
        current = { agents: [], disallowAll: false, allowAll: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && isWholeSite(value)) current.disallowAll = true;
    if (key === "allow" && isWholeSite(value)) current.allowAll = true;
  }
  return groups;
}

/**
 * Returns the known AI crawlers that robots.txt blocks from the whole site.
 * A crawler follows the group that names it; only if none does, the `*` group.
 * Within a group, `Allow: /` wins a tie with `Disallow: /` (longest match, allow on ties).
 */
export function findBlockedAiCrawlers(robotsTxt: string): string[] {
  const groups = parseGroups(robotsTxt);
  const wildcard = groups.filter((g) => g.agents.includes("*"));

  return AI_BOT_USER_AGENTS.filter((bot) => {
    const named = groups.filter((g) => g.agents.includes(bot.toLowerCase()));
    const applicable = named.length > 0 ? named : wildcard;
    const disallow = applicable.some((g) => g.disallowAll);
    const allow = applicable.some((g) => g.allowAll);
    return disallow && !allow;
  });
}
