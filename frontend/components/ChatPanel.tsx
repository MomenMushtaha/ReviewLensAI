"use client";
import { useState, useRef, useEffect } from "react";
import { useChat } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, Shield } from "lucide-react";

export function ChatPanel({ projectId }: { projectId: string }) {
  const { messages, loading, send } = useChat(projectId);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => { 
    if (input.trim()) {
      send(input); 
      setInput(""); 
    }
  };
  
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const SUGGESTIONS = [
    "What are the most common complaints?",
    "What do customers love most?",
    "How has sentiment changed over time?",
    "Which issues need immediate attention?",
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--info))] flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <span className="font-medium text-[hsl(var(--foreground))]">ReviewLens AI</span>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Answers based on your review data</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--secondary))] flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-7 w-7 text-[hsl(var(--primary))]" />
              </div>
              <h3 className="font-semibold text-[hsl(var(--foreground))] mb-1">How can I help?</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Ask me anything about your reviews
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-3 text-left text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary-hover))] hover:border-[hsl(var(--primary)/0.3)] transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] space-y-2">
              {msg.guardrailTriggered && (
                <div className="flex items-center gap-2 text-xs text-[hsl(var(--neutral))]">
                  <Shield className="h-3 w-3" />
                  <span>Response limited to review data</span>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[hsl(var(--primary))] text-white rounded-br-md"
                    : "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] rounded-bl-md"
                }`}
              >
                {msg.content}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="space-y-2 pl-2">
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Sources:</p>
                  {msg.sources.slice(0, 2).map((src, si) => (
                    <div 
                      key={si} 
                      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[hsl(var(--foreground))]">
                          {src.reviewer_name || "Anonymous"}
                        </span>
                        {src.rating && (
                          <span className="text-[hsl(var(--neutral))]">{"★".repeat(Math.round(src.rating))}</span>
                        )}
                      </div>
                      <p className="text-[hsl(var(--muted-foreground))] line-clamp-2">{src.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[hsl(var(--secondary))] rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span>Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[hsl(var(--border))] p-4">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your reviews..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-4 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] transition-all"
          />
          <Button 
            onClick={handleSend} 
            disabled={!input.trim() || loading} 
            className="px-4"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
