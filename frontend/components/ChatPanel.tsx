"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useChat } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ChatPanel({ projectId }: { projectId: string }) {
  const { messages, loading, send } = useChat(projectId);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => { send(input); setInput(""); };
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const SUGGESTIONS = [
    "What are the most common complaints?",
    "What do customers love most?",
    "How has sentiment changed over time?",
    "Which issues are mentioned most frequently?",
  ];

  return (
    <div className="flex h-[600px] flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
        <span className="text-lg">💬</span>
        <span className="text-sm font-medium text-gray-700">ReviewLens AI</span>
        <Badge variant="outline" className="ml-auto text-xs">Scope-locked to ingested reviews</Badge>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 text-center">Ask anything about the ingested reviews.</p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-gray-200 p-2.5 text-left text-xs text-gray-600 hover:bg-gray-50 hover:border-indigo-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] space-y-1">
              {msg.guardrailTriggered && (
                <div className="flex items-center gap-1 text-xs text-amber-600">
                  <span>🛡️</span>
                  <span>Scope guard triggered</span>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm whitespace-pre-wrap"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">{children}</ol>,
                      ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-2 space-y-1">{children}</ul>,
                      li: ({ children }) => <li className="pl-1">{children}</li>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="space-y-1 ml-1">
                  {msg.sources.slice(0, 2).map((src, si) => (
                    <div key={si} className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{src.reviewer_name || "Anonymous"}</span>
                      {src.rating && (
                        <span className="ml-1 text-yellow-500">★{src.rating.toFixed(0)}</span>
                      )}
                      <p className="mt-0.5 line-clamp-2">{src.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-gray-400 text-sm">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about the reviews… (Enter to send)"
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <Button onClick={handleSend} disabled={!input.trim() || loading} size="md">Send</Button>
      </div>
    </div>
  );
}
