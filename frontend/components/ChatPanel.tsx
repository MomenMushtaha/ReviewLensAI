"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useChat } from "@/hooks/useChat";
import { Badge } from "@/components/ui/badge";

function GuardrailBadge({ category }: { category?: string | null }) {
  const config = {
    off_topic: {
      bg: "bg-amber-500/10 border-amber-500/15",
      text: "text-amber-400",
      label: "Outside review scope",
    },
    hallucination_detected: {
      bg: "bg-red-500/10 border-red-500/15",
      text: "text-red-300",
      label: "Response filtered for accuracy",
    },
    no_relevant_reviews: {
      bg: "bg-zinc-500/10 border-zinc-500/15",
      text: "text-zinc-400",
      label: "No matching reviews found",
    },
  }[category ?? ""] ?? {
    bg: "bg-amber-500/10 border-amber-500/15",
    text: "text-amber-400",
    label: "Scope guard triggered",
  };

  return (
    <div
      className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 border ${config.bg} ${config.text}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      <span>{config.label}</span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start animate-message-in">
      <div className="bg-white/5 border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
          <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
          <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="text-amber-400 tabular-nums text-[11px]">
      {"★".repeat(rounded)}
      {"☆".repeat(5 - rounded)}
    </span>
  );
}

export function ChatPanel({ projectId }: { projectId: string }) {
  const { messages, loading, send } = useChat(projectId);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = (text?: string) => {
    const value = text ?? input;
    if (!value.trim() || loading) return;
    send(value);
    if (!text) setInput("");
  };
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const SUGGESTIONS = [
    "What are the most common complaints?",
    "What do customers love most?",
    "How has sentiment changed over time?",
    "Which issues are mentioned most frequently?",
  ];

  return (
    <div className="flex h-[600px] flex-col glass rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/5 bg-white/3 px-4 py-3">
        <div className="h-6 w-6 rounded-md bg-indigo-500/20 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-400"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <span className="text-sm font-medium text-zinc-300">ReviewLens AI</span>
        <Badge variant="outline" className="ml-auto text-[10px]">
          Scope-locked to reviews
        </Badge>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3 animate-message-in">
            <p className="text-sm text-zinc-500 text-center">
              Ask anything about the ingested reviews.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-lg border border-white/10 bg-white/3 p-2.5 text-left text-xs text-zinc-400 hover:bg-white/5 hover:border-indigo-500/30 hover:text-zinc-300 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex animate-message-in ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div className="max-w-[80%] space-y-2">
              {msg.guardrailTriggered && (
                <GuardrailBadge category={msg.guardrailCategory} />
              )}
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm whitespace-pre-wrap shadow-lg shadow-indigo-500/20"
                    : "bg-white/5 text-zinc-300 rounded-bl-sm border border-white/5"
                }`}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0">{children}</p>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-zinc-100">
                          {children}
                        </strong>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">
                          {children}
                        </ol>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-outside ml-4 mb-2 space-y-1">
                          {children}
                        </ul>
                      ),
                      li: ({ children }) => (
                        <li className="pl-1">{children}</li>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-indigo-500/40 pl-3 my-2 text-zinc-400 italic">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>

              {/* Source citations — collapsible */}
              {msg.sources && msg.sources.length > 0 && (
                <details className="ml-1 group/sources">
                  <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors select-none list-none flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-transform group-open/sources:rotate-90"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    {msg.sources.length} source
                    {msg.sources.length !== 1 ? "s" : ""} cited
                  </summary>
                  <div className="space-y-1.5 mt-1.5">
                    {msg.sources.slice(0, 3).map((src, si) => (
                      <div
                        key={si}
                        className="rounded-lg border border-white/5 bg-white/3 p-2.5 text-xs text-zinc-500"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-zinc-300">
                            {src.reviewer_name || "Anonymous"}
                          </span>
                          {src.rating != null && (
                            <StarRating rating={src.rating} />
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 leading-relaxed">
                          {src.excerpt}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Follow-up chips — only on the last assistant message */}
              {msg.role === "assistant" &&
                msg.followUps &&
                msg.followUps.length > 0 &&
                i === messages.length - 1 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {msg.followUps.map((q, fi) => (
                      <button
                        key={fi}
                        onClick={() => handleSend(q)}
                        disabled={loading}
                        className="group/chip rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-500/15 hover:border-indigo-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="opacity-70 group-hover/chip:opacity-100 transition-opacity">
                          {q}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/5 p-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about the reviews... (Enter to send)"
          rows={1}
          className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
