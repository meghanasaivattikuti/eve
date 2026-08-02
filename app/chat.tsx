"use client";

import { useState } from "react";
import { useEveAgent } from "eve/react";
import type { EveMessagePart } from "eve/react";

const EXAMPLES = ["vercel.com", "stripe.com", "anthropic.com"];

function ToolCall({ part }: { part: EveMessagePart & { type: "dynamic-tool" } }) {
  const label =
    part.state === "output-available"
      ? `Ran ${part.toolName}`
      : part.state === "output-error"
        ? `${part.toolName} failed`
        : `Running ${part.toolName}…`;

  return (
    <div className="tool-call">
      {label}
      {part.state === "output-available" ? (
        <pre>{JSON.stringify(part.output, null, 2)}</pre>
      ) : null}
      {part.state === "output-error" ? <pre>{part.errorText}</pre> : null}
    </div>
  );
}

function Part({ part }: { part: EveMessagePart }) {
  if (part.type === "text") return <>{part.text}</>;
  if (part.type === "dynamic-tool") return <ToolCall part={part} />;
  return null;
}

export function Chat() {
  const agent = useEveAgent();
  const [draft, setDraft] = useState("");
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || isBusy) return;
    void agent.send({ message: trimmed });
    setDraft("");
  };

  return (
    <>
      <div className="messages">
        {agent.data.messages.length === 0 ? (
          <div className="empty-state">
            Ask it to audit a domain, e.g. &ldquo;audit vercel.com&rdquo;. Try:
            <div>
              {EXAMPLES.map((domain) => (
                <button key={domain} onClick={() => submit(`audit ${domain}`)}>
                  {domain}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {agent.data.messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.parts.length === 0 && message.metadata?.status === "failed" ? (
              <span className="error-text">Something went wrong sending this message.</span>
            ) : null}
            {message.parts.map((part, index) => (
              <Part key={index} part={part} />
            ))}
          </div>
        ))}
        {agent.status === "error" ? (
          <div className="message assistant error-text">
            {agent.error?.message ?? "The agent hit an error. Check server logs (npx eve logs) or, in production, confirm ANTHROPIC_API_KEY is set on the Vercel project."}
          </div>
        ) : null}
      </div>
      <div className="composer">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="audit a domain, e.g. audit vercel.com"
            disabled={isBusy}
          />
          <button type="submit" disabled={isBusy}>
            {isBusy ? "Auditing…" : "Send"}
          </button>
        </form>
      </div>
    </>
  );
}
