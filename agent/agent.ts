import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5",
  // Public, unauthenticated demo: cap spend per session. An audit is ~3 tool calls,
  // so these leave room for many audits while bounding a runaway session.
  limits: {
    maxInputTokensPerSession: 150_000,
    maxOutputTokensPerSession: 20_000,
  },
});
