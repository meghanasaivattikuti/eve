import { test } from "node:test";
import assert from "node:assert/strict";
import { findBlockedAiCrawlers } from "../agent/lib/robots.ts";

test("no rules blocks nothing", () => {
  assert.deepEqual(findBlockedAiCrawlers(""), []);
  assert.deepEqual(findBlockedAiCrawlers("User-agent: *\nAllow: /"), []);
});

test("blocks a named AI bot with Disallow: /", () => {
  assert.deepEqual(findBlockedAiCrawlers("User-agent: GPTBot\nDisallow: /"), ["GPTBot"]);
});

test("user-agent match is case-insensitive", () => {
  assert.deepEqual(findBlockedAiCrawlers("user-agent: gptbot\ndisallow: /"), ["GPTBot"]);
});

test("grouped User-agent lines share one rule set", () => {
  const txt = "User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /";
  assert.deepEqual(findBlockedAiCrawlers(txt).sort(), ["ClaudeBot", "GPTBot"]);
});

test("a new User-agent after rules starts a new group", () => {
  const txt = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /";
  assert.deepEqual(findBlockedAiCrawlers(txt), ["GPTBot"]);
});

test("only a partial Disallow path is not a full block", () => {
  assert.deepEqual(findBlockedAiCrawlers("User-agent: GPTBot\nDisallow: /private"), []);
  assert.deepEqual(findBlockedAiCrawlers("User-agent: GPTBot\nDisallow:"), []);
});

test("Disallow: /* counts as a full block", () => {
  assert.deepEqual(findBlockedAiCrawlers("User-agent: CCBot\nDisallow: /*"), ["CCBot"]);
});

test("wildcard Disallow: / blocks every AI crawler", () => {
  assert.equal(findBlockedAiCrawlers("User-agent: *\nDisallow: /").length, 8);
});

test("a named group overrides the wildcard group", () => {
  const txt = "User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /";
  const blocked = findBlockedAiCrawlers(txt);
  assert.ok(!blocked.includes("GPTBot"));
  assert.ok(blocked.includes("ClaudeBot"));
});

test("Allow: / beats Disallow: / in the same group", () => {
  assert.deepEqual(findBlockedAiCrawlers("User-agent: GPTBot\nDisallow: /\nAllow: /"), []);
});

test("handles CRLF, comments and odd spacing", () => {
  const txt = "# rules\r\nUser-agent :  GPTBot  # ai\r\nDisallow :  /  # all\r\n";
  assert.deepEqual(findBlockedAiCrawlers(txt), ["GPTBot"]);
});

test("ignores non-AI bots and rules before any User-agent", () => {
  assert.deepEqual(findBlockedAiCrawlers("Disallow: /\nUser-agent: Googlebot\nDisallow: /"), []);
});
