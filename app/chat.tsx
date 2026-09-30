"use client";

import { useEffect, useRef, useState } from "react";
import { useEveAgent } from "eve/react";
import type { EveMessagePart } from "eve/react";
import type { MessageStreamEvent, SessionState } from "eve/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const EXAMPLES = ["vercel.com", "stripe.com", "anthropic.com"];
const STORAGE_KEY = "crawlspace-chat";
const SCROLL_THROTTLE_MS = 200;
const MAX_TOOL_OUTPUT_CHARS = 20_000;

function formatToolOutput(output: unknown): string {
  const text = JSON.stringify(output, null, 2) ?? "";
  return text.length > MAX_TOOL_OUTPUT_CHARS
    ? `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n… (truncated ${text.length - MAX_TOOL_OUTPUT_CHARS} characters)`
    : text;
}

type SavedChat = {
  events?: readonly MessageStreamEvent[];
  session?: SessionState;
};

function loadSavedChat(): SavedChat {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedChat) : {};
  } catch {
    return {};
  }
}

function ToolCall({ part }: { part: EveMessagePart & { type: "dynamic-tool" } }) {
  const label =
    part.state === "output-available"
      ? `Ran ${part.toolName}`
      : part.state === "output-error"
        ? `${part.toolName} failed`
        : `Running ${part.toolName}…`;

  if (part.state !== "output-available" && part.state !== "output-error") {
    return <div className="tool-call">{label}</div>;
  }

  return (
    <details className="tool-call">
      <summary>{label}</summary>
      {part.state === "output-available" ? (
        <pre>{formatToolOutput(part.output)}</pre>
      ) : (
        <pre>{part.errorText.slice(0, MAX_TOOL_OUTPUT_CHARS)}</pre>
      )}
    </details>
  );
}

function Part({ part }: { part: EveMessagePart }) {
  if (part.type === "text") {
    return (
      <div className="markdown">
        <Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown>
      </div>
    );
  }
  if (part.type === "dynamic-tool") return <ToolCall part={part} />;
  return null;
}

type ChatSessionProps = {
  initialEvents?: readonly MessageStreamEvent[];
  initialSession?: SessionState;
};

function ChatSession({ initialEvents, initialSession }: ChatSessionProps) {
  const agent = useEveAgent({
    initialEvents,
    initialSession,
    onFinish(snapshot) {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ events: snapshot.events, session: snapshot.session }),
        );
      } catch {
        // localStorage unavailable (private browsing, quota, etc.), skip persistence
      }
    },
  });
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastScrollRef = useRef(0);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  // Throttled so each smooth-scroll animation can finish, but with a trailing call:
  // a render that lands inside the throttle window schedules a scroll for when it
  // expires, so the last chunk of a streamed report always ends up in view.
  useEffect(() => {
    const scroll = () => {
      lastScrollRef.current = Date.now();
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };
    clearTimeout(scrollTimerRef.current);
    const wait = SCROLL_THROTTLE_MS - (Date.now() - lastScrollRef.current);
    if (wait <= 0) scroll();
    else scrollTimerRef.current = setTimeout(scroll, wait);
  });

  useEffect(() => () => clearTimeout(scrollTimerRef.current), []);

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
        <div ref={bottomRef} className="scroll-anchor" />
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

export function Chat() {
  const [saved, setSaved] = useState<SavedChat>({});

  useEffect(() => {
    setSaved(loadSavedChat());
  }, []);

  // Session config is read once when useEveAgent's store is created, so
  // ChatSession must remount (via `key`) once the saved session loads from
  // localStorage after mount, a fresh render with new props isn't enough.
  const key = saved.session?.sessionId ?? "fresh";

  return <ChatSession key={key} initialEvents={saved.events} initialSession={saved.session} />;
}
