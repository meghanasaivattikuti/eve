import type { MetadataRoute } from "next";
import { SITE_URL } from "./site";

const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "CCBot",
  "Bytespider",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: ["*", ...AI_BOTS].map((userAgent) => ({ userAgent, allow: "/" })),
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
