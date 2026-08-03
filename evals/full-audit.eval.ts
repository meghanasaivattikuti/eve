import { defineEval } from "eve/evals";

export default defineEval({
  description: "A request to audit a domain calls all three audit tools and succeeds.",
  async test(t) {
    await t.send("audit vercel.com");
    t.succeeded();
    t.calledTool("audit_agent_readiness");
    t.calledTool("check_seo");
    t.calledTool("check_security_headers");
  },
});
