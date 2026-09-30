import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const USER_AGENT = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `CrawlSpaceBot/1.0 (+https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}; site readiness audit)`
  : "CrawlSpaceBot/1.0 (site readiness audit)";
const TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 500;

export type FetchResult =
  | {
      ok: true;
      status: number;
      url: string;
      headers: Headers;
      contentType: string;
      body: string;
    }
  | { ok: false; status: number | null; error: string };

export type ResolvedTarget = { ok: true; origin: string } | { ok: false; error: string };

// --- URL validation -------------------------------------------------------

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = ipv4ToInt(base);
    return n >= start && n < start + size;
  });
}

function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase().split("%")[0];
  const dotted = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const n = ipv4ToInt(dotted[2]);
    addr = `${dotted[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail, extra] = addr.split("::");
  if (extra !== undefined) return null;
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [...headGroups, ...Array(tail === undefined ? 0 : missing).fill("0"), ...tailGroups];
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.length === 8 && nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff)
    ? nums
    : null;
}

function isBlockedIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return true; // unparseable: fail closed
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96): judge the embedded IPv4.
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return isBlockedIPv4(v4(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0)) {
    return isBlockedIPv4(v4(g[6], g[7]));
  }
  // ::/96 (unspecified, loopback, IPv4-compatible)
  if (g.slice(0, 6).every((n) => n === 0)) return true;
  // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast, 2002::/16 6to4
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00 || g[0] === 0x2002;
}

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true;
}

/** Throws if the URL is not a public http(s) host. Resolves DNS and checks every address. */
async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("Host is not publicly routable");
  }
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error("Host is not publicly routable");
    return;
  }
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isBlockedIp(a.address))) {
    throw new Error("Host is not publicly routable");
  }
}

/** Normalizes user input ("example.com" or a URL) to a validated public origin. Never throws. */
export async function resolveTarget(input: string): Promise<ResolvedTarget> {
  try {
    const trimmed = input.trim();
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    await assertPublicUrl(url);
    return { ok: true, origin: url.origin };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid domain" };
  }
}

// --- Fetching -------------------------------------------------------------

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const merged = new Uint8Array(Math.min(total, MAX_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, merged.byteLength - offset);
    merged.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= merged.byteLength) break;
  }
  return new TextDecoder().decode(merged);
}

async function safeFetchUncached(rawUrl: string): Promise<FetchResult> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = rawUrl;
  try {
    // Redirects are followed manually so every hop is re-validated (DNS included).
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = new URL(current);
      await assertPublicUrl(url);
      const res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.5",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        if (!location) return { ok: false, status: res.status, error: "Redirect without location" };
        current = new URL(location, url).toString();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, status: res.status, error: `HTTP ${res.status}` };
      }
      return {
        ok: true,
        status: res.status,
        url: url.toString(),
        headers: res.headers,
        contentType: (res.headers.get("content-type") ?? "").toLowerCase(),
        body: await readCapped(res),
      };
    }
    return { ok: false, status: null, error: "Too many redirects" };
  } catch (err) {
    return { ok: false, status: null, error: err instanceof Error ? err.message : "Fetch failed" };
  }
}

// --- Cache + in-flight de-duplication ------------------------------------
// Per-instance memory. Concurrent callers for the same URL share one request,
// and results (including failures) are reused for CACHE_TTL_MS.

const cache = new Map<string, { expires: number; result: FetchResult }>();
const inFlight = new Map<string, Promise<FetchResult>>();

export function safeFetch(url: string): Promise<FetchResult> {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.result);

  const pending = inFlight.get(url);
  if (pending) return pending;

  const request = safeFetchUncached(url)
    .then((result) => {
      if (cache.size >= CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(url, { expires: Date.now() + CACHE_TTL_MS, result });
      return result;
    })
    .finally(() => inFlight.delete(url));
  inFlight.set(url, request);
  return request;
}

// --- Content checks (soft-404 defense) -----------------------------------

const looksLikeHtml = (r: { contentType: string; body: string }) =>
  r.contentType.includes("text/html") || /^\s*(<!doctype html|<html)/i.test(r.body);

/** A 200 counts as a real text file only when it is not an HTML page and is non-empty. */
export function isRealTextFile(r: FetchResult): r is Extract<FetchResult, { ok: true }> {
  return r.ok && r.body.trim().length > 0 && !looksLikeHtml(r);
}

/** A sitemap must be XML (or a plain-text URL list) and contain sitemap markup, not an HTML error page. */
export function isRealSitemap(r: FetchResult): r is Extract<FetchResult, { ok: true }> {
  return r.ok && !looksLikeHtml(r) && /<(urlset|sitemapindex)[\s>]/i.test(r.body);
}

export { looksLikeHtml };
