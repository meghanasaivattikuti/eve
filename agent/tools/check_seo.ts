import { defineTool } from "eve/tools";
import { z } from "zod";
import { fetchText } from "#lib/http.js";

function extractTag(html: string, regex: RegExp): string | null {
  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

function extractMetaContent(html: string, attr: "name" | "property", key: string): string | null {
  const beforeContent = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const afterContent = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`,
    "i",
  );
  return html.match(beforeContent)?.[1]?.trim() ?? html.match(afterContent)?.[1]?.trim() ?? null;
}

function extractCanonicalUrl(html: string): string | null {
  const hrefFirst = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i;
  const relFirst = /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i;
  return html.match(hrefFirst)?.[1]?.trim() ?? html.match(relFirst)?.[1]?.trim() ?? null;
}

function extractJsonLdTypes(html: string): string[] {
  const blocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  const types: string[] = [];
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object" && "@type" in item) {
          types.push(String((item as Record<string, unknown>)["@type"]));
        }
      }
    } catch {
      // malformed JSON-LD, skip
    }
  }
  return types;
}

function estimateVisibleTextLength(html: string): number {
  const withoutScriptsAndStyles = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const textOnly = withoutScriptsAndStyles.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return textOnly.length;
}

export default defineTool({
  description:
    "Check a website's core SEO signals: title, meta description, canonical URL, Open Graph and Twitter card tags, structured data (JSON-LD), sitemap.xml, and whether the page has meaningful server-rendered content.",
  inputSchema: z.object({
    domain: z.string().min(1).describe("Domain or URL, e.g. example.com"),
  }),
  async execute({ domain }) {
    const base = domain.startsWith("http") ? domain : `https://${domain}`;
    const origin = new URL(base).origin;

    const [page, sitemap] = await Promise.all([
      fetchText(origin),
      fetchText(`${origin}/sitemap.xml`),
    ]);

    if (!page.ok) {
      return { domain: origin, reachable: false };
    }

    const html = page.body;
    const visibleTextLength = estimateVisibleTextLength(html);
    const jsonLdTypes = extractJsonLdTypes(html);

    return {
      domain: origin,
      reachable: true,
      title: extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
      meta_description: extractMetaContent(html, "name", "description"),
      canonical_url: extractCanonicalUrl(html),
      open_graph: {
        title: extractMetaContent(html, "property", "og:title"),
        description: extractMetaContent(html, "property", "og:description"),
        image: extractMetaContent(html, "property", "og:image"),
      },
      twitter_card: extractMetaContent(html, "name", "twitter:card"),
      structured_data: {
        present: jsonLdTypes.length > 0,
        types: jsonLdTypes,
      },
      sitemap_xml: { present: sitemap.ok, url: `${origin}/sitemap.xml` },
      server_rendered_content: {
        likely: visibleTextLength > 200,
        visible_text_length: visibleTextLength,
        note:
          visibleTextLength > 200
            ? "Raw HTML contains a meaningful amount of visible text, consistent with server-rendered or static content."
            : "Raw HTML has very little visible text. This can mean the page is client-side rendered and mostly empty until JavaScript runs, which hurts both search crawlers and AI agents that don't execute JS.",
      },
    };
  },
});
