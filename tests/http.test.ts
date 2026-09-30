import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isBlockedIp,
  isRealSitemap,
  isRealTextFile,
  resolveTarget,
  safeFetch,
  type FetchResult,
} from "../agent/lib/http.ts";

describe("isBlockedIp", () => {
  const blocked = [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1", // how Node normalizes the line above; this was a real bypass
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1", // NAT64 wrapping 127.0.0.1
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2002:7f00:1::", // 6to4 wrapping 127.0.0.1
    "not-an-ip", // unparseable fails closed
  ];
  const allowed = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "::ffff:8.8.8.8", "2606:4700:4700::1111"];

  for (const ip of blocked) test(`blocks ${ip}`, () => assert.equal(isBlockedIp(ip), true));
  for (const ip of allowed) test(`allows ${ip}`, () => assert.equal(isBlockedIp(ip), false));
});

describe("resolveTarget", () => {
  const rejected = [
    "http://169.254.169.254/latest/meta-data",
    "localhost",
    "http://localhost:3000",
    "foo.localhost",
    "service.internal",
    "127.0.0.1:3000",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[fd00::1]/",
    "10.0.0.5",
    "192.168.1.1",
    "0x7f000001", // hex form of 127.0.0.1
    "2130706433", // decimal form of 127.0.0.1
    "file:///etc/passwd",
    "ftp://example.com",
    "gopher://example.com",
    "javascript:alert(1)",
    "http://user:pass@8.8.8.8",
    "",
    "   ",
    "ht!tp bad",
  ];
  for (const input of rejected) {
    test(`rejects ${JSON.stringify(input)}`, async () => {
      const result = await resolveTarget(input);
      assert.equal(result.ok, false);
    });
  }

  test("never throws on garbage input", async () => {
    for (const input of ["http://", "://", "http://[", "%%%", "a".repeat(5000)]) {
      const result = await resolveTarget(input);
      assert.equal(typeof result.ok, "boolean");
    }
  });

  test("normalizes a public IP and adds https to bare hosts", async () => {
    assert.deepEqual(await resolveTarget("8.8.8.8"), { ok: true, origin: "https://8.8.8.8" });
  });

  test("keeps only the origin of a full URL", async () => {
    assert.deepEqual(await resolveTarget("http://8.8.8.8:8080/a/b?x=1#y"), {
      ok: true,
      origin: "http://8.8.8.8:8080",
    });
  });
});

describe("safeFetch", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const html = (body: string, init: ResponseInit = {}) =>
    new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });

  test("does not follow a redirect to a private address", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL) => {
      calls.push(String(input));
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
    }) as typeof fetch;

    const result = await safeFetch("http://8.8.8.8/redirect-private");
    assert.equal(result.ok, false);
    assert.equal(calls.length, 1, "the private hop must never be requested");
  });

  test("follows a redirect between public hosts and re-validates each hop", async () => {
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url === "http://8.8.8.8/hop") {
        return new Response(null, { status: 301, headers: { location: "https://1.1.1.1/final" } });
      }
      return html("<html>ok</html>");
    }) as typeof fetch;

    const result = await safeFetch("http://8.8.8.8/hop");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.url, "https://1.1.1.1/final");
  });

  test("gives up after too many redirects", async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 302, headers: { location: "http://8.8.8.8/loop" } })) as typeof fetch;
    const result = await safeFetch("http://8.8.8.8/loop");
    assert.equal(result.ok, false);
  });

  test("caps the body at 1 MB", async () => {
    globalThis.fetch = (async () => html("a".repeat(3_000_000))) as typeof fetch;
    const result = await safeFetch("http://8.8.8.8/huge");
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.body.length <= 1_000_000);
  });

  test("sends an identifying User-Agent", async () => {
    let userAgent = "";
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      userAgent = new Headers(init?.headers).get("user-agent") ?? "";
      return html("<html></html>");
    }) as typeof fetch;
    await safeFetch("http://8.8.8.8/ua");
    assert.match(userAgent, /^CrawlSpaceBot\//);
  });

  test("returns non-2xx responses as failures with the status", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    const result = await safeFetch("http://8.8.8.8/missing");
    assert.deepEqual(result.ok ? null : result.status, 404);
  });

  test("turns network errors into a failed result instead of throwing", async () => {
    globalThis.fetch = (async () => {
      throw new Error("boom");
    }) as typeof fetch;
    const result = await safeFetch("http://8.8.8.8/network-error");
    assert.equal(result.ok, false);
  });

  test("de-duplicates concurrent requests for the same URL", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return html("<html>x</html>");
    }) as typeof fetch;
    const [a, b, c] = await Promise.all([
      safeFetch("http://8.8.8.8/dedupe"),
      safeFetch("http://8.8.8.8/dedupe"),
      safeFetch("http://8.8.8.8/dedupe"),
    ]);
    assert.equal(calls, 1);
    assert.equal(a, b);
    assert.equal(b, c);
  });

  test("serves repeat requests from the cache", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return html("<html>cached</html>");
    }) as typeof fetch;
    await safeFetch("http://8.8.8.8/cache");
    await safeFetch("http://8.8.8.8/cache");
    assert.equal(calls, 1);
  });

  test("does not share cache entries between different URLs", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return html("<html></html>");
    }) as typeof fetch;
    await safeFetch("http://8.8.8.8/one");
    await safeFetch("http://8.8.8.8/two");
    assert.equal(calls, 2);
  });
});

describe("soft-404 detection", () => {
  const ok = (body: string, contentType: string): FetchResult => ({
    ok: true,
    status: 200,
    url: "https://example.com/x",
    headers: new Headers(),
    contentType,
    body,
  });
  const failed: FetchResult = { ok: false, status: 404, error: "HTTP 404" };

  test("HTML at a text-file path is not a real file", () => {
    assert.equal(isRealTextFile(ok("<!doctype html><html>Not found</html>", "text/html")), false);
    assert.equal(isRealTextFile(ok("<html><body>404</body></html>", "")), false);
  });

  test("HTML is caught even with a wrong content-type", () => {
    assert.equal(isRealTextFile(ok("  <!DOCTYPE HTML><html></html>", "text/plain")), false);
  });

  test("real text and markdown files count", () => {
    assert.equal(isRealTextFile(ok("# Title\n> summary", "text/plain")), true);
    assert.equal(isRealTextFile(ok("User-agent: *\nAllow: /", "text/plain")), true);
    assert.equal(isRealTextFile(ok("# AGENTS", "text/markdown")), true);
  });

  test("empty bodies and failures do not count", () => {
    assert.equal(isRealTextFile(ok("   \n", "text/plain")), false);
    assert.equal(isRealTextFile(failed), false);
  });

  test("a sitemap must contain urlset or sitemapindex", () => {
    assert.equal(isRealSitemap(ok("<urlset><url><loc>x</loc></url></urlset>", "application/xml")), true);
    assert.equal(isRealSitemap(ok('<sitemapindex xmlns="x"></sitemapindex>', "text/xml")), true);
    assert.equal(isRealSitemap(ok("<html><body>404</body></html>", "text/html")), false);
    assert.equal(isRealSitemap(ok("<rss></rss>", "application/xml")), false);
    assert.equal(isRealSitemap(failed), false);
  });
});
