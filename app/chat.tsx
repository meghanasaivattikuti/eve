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

const TOOL_LABELS: Record<string, { running: string; done: string; failed: string }> = {
  audit_agent_readiness: {
    running: "Checking agent readability (llms.txt, AGENTS.md, robots.txt)…",
    done: "Checked agent readability",
    failed: "Agent readability check failed",
  },
  check_seo: {
    running: "Checking SEO (title, meta tags, structured data, sitemap)…",
    done: "Checked SEO",
    failed: "SEO check failed",
  },
  check_security_headers: {
    running: "Checking security headers…",
    done: "Checked security headers",
    failed: "Security headers check failed",
  },
};

function ToolCall({ part }: { part: EveMessagePart & { type: "dynamic-tool" } }) {
  const labels = TOOL_LABELS[part.toolName] ?? {
    running: `Running ${part.toolName}…`,
    done: `Ran ${part.toolName}`,
    failed: `${part.toolName} failed`,
  };

  if (part.state !== "output-available" && part.state !== "output-error") {
    return (
      <div className="tool-call running" role="status">
        <span className="spinner" aria-hidden="true" />
        {labels.running}
      </div>
    );
  }

  const failed = part.state === "output-error";
  return (
    <details className={`tool-call${failed ? " failed" : ""}`}>
      <summary>
        <span>{failed ? labels.failed : `\u2713 ${labels.done}`}</span>
        <span className="tool-call-hint">view raw data</span>
      </summary>
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
  onClear: () => void;
};

function isClearCommand(text: string): boolean {
  const command = text.toLowerCase();
  return command === "clear" || command === "/clear";
}

function ChatSession({ initialEvents, initialSession, onClear }: ChatSessionProps) {
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
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Keep the cursor in the box: on load, and again when a report finishes.
  useEffect(() => {
    if (!isBusy) inputRef.current?.focus({ preventScroll: true });
  }, [isBusy]);

  const messages = agent.data.messages;
  const lastMessage = messages[messages.length - 1];
  const hasReplyText = lastMessage?.role === "assistant" && lastMessage.parts.some((part) => part.type === "text");
  const showWorking = isBusy && !hasReplyText;

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || isBusy) return;
    if (isClearCommand(trimmed)) {
      onClear();
      return;
    }
    void agent.send({ message: trimmed });
    setDraft("");
  };

  return (
    <>
      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            Enter a domain below, or try one of these:
            <div>
              {EXAMPLES.map((domain) => (
                <button key={domain} onClick={() => submit(`audit ${domain}`)}>
                  {domain}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.parts.length === 0 && message.metadata?.status === "failed" ? (
              <span className="error-text">Something went wrong sending this message.</span>
            ) : null}
            {message.parts.map((part, index) => (
              <Part key={index} part={part} />
            ))}
          </div>
        ))}
        {showWorking ? (
          <div className="working" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            Auditing your site. A full report usually takes 15 to 25 seconds.
          </div>
        ) : null}
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
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Enter a domain, e.g. vercel.com"
            aria-label="Domain to audit"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={isBusy}
          />
          <button type="submit" disabled={isBusy || draft.trim().length === 0}>
            {isBusy ? "Auditing…" : "Audit"}
          </button>
        </form>
        <p className="composer-hint">
          Type <kbd>clear</kbd> or <kbd>/clear</kbd> to start a fresh chat. Your conversation is saved in this
          browser.
          {messages.length > 0 ? (
            <>
              {" "}
              <button type="button" className="link-button" onClick={onClear} disabled={isBusy}>
                Clear chat
              </button>
            </>
          ) : null}
        </p>
      </div>
    </>
  );
}

export function Chat() {
  const [saved, setSaved] = useState<SavedChat>({});
  const [resets, setResets] = useState(0);

  useEffect(() => {
    setSaved(loadSavedChat());
  }, []);

  const clearChat = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable, the in-memory reset below still clears the view
    }
    setSaved({});
    setResets((n) => n + 1);
  };

  // Session config is read once when useEveAgent's store is created, so
  // ChatSession must remount (via `key`) once the saved session loads from
  // localStorage after mount, a fresh render with new props isn't enough.
  // `resets` also forces a remount on clear, since the key alone would stay
  // "fresh" if the conversation started before any session was saved.
  const key = `${saved.session?.sessionId ?? "fresh"}-${resets}`;

  return (
    <ChatSession
      key={key}
      initialEvents={saved.events}
      initialSession={saved.session}
      onClear={clearChat}
    />
  );
}
