import { defineEval } from "eve/evals";

export default defineEval({
  description: "A message with no domain to audit should not trigger any audit tool calls.",
  async test(t) {
    await t.send("Hi, what do you do?");
    t.succeeded();
    t.notCalledTool("audit_agent_readiness");
    t.notCalledTool("check_seo");
    t.notCalledTool("check_security_headers");
  },
});
