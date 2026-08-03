import { defineTool } from "eve/tools";
import { z } from "zod";

const SECURITY_HEADERS = [
  {
    header: "strict-transport-security",
    label: "Strict-Transport-Security",
    why: "Forces HTTPS on future visits and prevents protocol downgrade attacks.",
  },
  {
    header: "content-security-policy",
    label: "Content-Security-Policy",
    why: "Restricts what scripts and resources the page can load, the main defense against XSS.",
  },
  {
    header: "x-content-type-options",
    label: "X-Content-Type-Options",
    why: "Stops browsers from MIME-sniffing responses into an unintended, potentially dangerous content type.",
  },
  {
    header: "x-frame-options",
    label: "X-Frame-Options",
    why: "Prevents the page from being framed by other sites, the main defense against clickjacking.",
  },
  {
    header: "referrer-policy",
    label: "Referrer-Policy",
    why: "Controls how much of this page's URL leaks to other sites via the Referer header.",
  },
  {
    header: "permissions-policy",
    label: "Permissions-Policy",
    why: "Restricts which browser features (camera, microphone, geolocation, etc.) the page can access.",
  },
];

export default defineTool({
  description:
    "Check a website's HTTP security headers: HSTS, Content-Security-Policy, X-Frame-Options, Referrer-Policy, and more.",
  inputSchema: z.object({
    domain: z.string().min(1).describe("Domain or URL, e.g. example.com"),
  }),
  async execute({ domain }) {
    const base = domain.startsWith("http") ? domain : `https://${domain}`;
    const origin = new URL(base).origin;

    let headers: Headers;
    let status: number;
    try {
      const res = await fetch(origin, { redirect: "follow" });
      headers = res.headers;
      status = res.status;
    } catch {
      return { domain: origin, reachable: false, headers: [] };
    }

    return {
      domain: origin,
      reachable: true,
      status,
      headers: SECURITY_HEADERS.map(({ header, label, why }) => ({
        header: label,
        present: headers.has(header),
        value: headers.get(header),
        why,
      })),
    };
  },
});
