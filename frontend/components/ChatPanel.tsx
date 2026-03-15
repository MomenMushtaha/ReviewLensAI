"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { useChat } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Analysis, ChatMessage, ChatSource } from "@/types";

interface ChatPanelProps {
  projectId: string;
  analysis?: Analysis | null;
  reviewCount?: number;
  productName?: string | null;
}

// ── Sentiment color helpers ──────────────────────────────────────────────────

const SENTIMENT_STYLES: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  positive: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Positive", dot: "bg-emerald-400" },
  negative: { bg: "bg-red-500/15", text: "text-red-400", label: "Negative", dot: "bg-red-400" },
  neutral: { bg: "bg-zinc-500/15", text: "text-zinc-400", label: "Neutral", dot: "bg-zinc-400" },
  mixed: { bg: "bg-amber-500/15", text: "text-amber-400", label: "Mixed", dot: "bg-amber-400" },
};

function SentimentDot({ sentiment }: { sentiment?: string | null }) {
  if (!sentiment) return null;
  const s = SENTIMENT_STYLES[sentiment] || SENTIMENT_STYLES.neutral;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── Source citation card ─────────────────────────────────────────────────────

function SourceCard({ source, index }: { source: ChatSource; index: number }) {
  const [expanded, setExpanded] = useState(false);

  // Detect rating/sentiment mismatch
  const hasMismatch = source.rating != null && source.sentiment && (
    (source.rating >= 4 && source.sentiment === "negative") ||
    (source.rating <= 2 && source.sentiment === "positive")
  );

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={`w-full rounded-lg border p-2.5 text-left text-xs transition-all group ${
        hasMismatch
          ? "border-amber-500/20 bg-amber-500/[0.03] hover:bg-amber-500/[0.06]"
          : "border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-4 w-4 items-center justify-center rounded bg-indigo-500/20 text-[9px] font-bold text-indigo-400 shrink-0">
          {index}
        </span>
        <span className="font-medium text-zinc-300 truncate">
          {source.reviewer_name || "Anonymous"}
        </span>
        {source.rating != null && (
          <span className="text-amber-400 shrink-0">
            {"★".repeat(Math.round(source.rating))}
            <span className="text-zinc-600">{"★".repeat(5 - Math.round(source.rating))}</span>
          </span>
        )}
        <SentimentDot sentiment={source.sentiment} />
        {hasMismatch && (
          <span className="text-[9px] text-amber-400/80 font-medium shrink-0">Mismatch</span>
        )}
        {source.similarity != null && (
          <span className="ml-auto text-[10px] text-zinc-600 shrink-0">
            {(source.similarity * 100).toFixed(0)}% match
          </span>
        )}
      </div>
      <p className={`mt-1 text-zinc-500 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
        {source.excerpt}
      </p>
      {!expanded && source.excerpt.length > 120 && (
        <span className="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
          click to expand
        </span>
      )}
    </button>
  );
}

// ── Evidence strength indicator ──────────────────────────────────────────────

function EvidenceStrength({ sourceCount }: { sourceCount: number }) {
  if (sourceCount === 0) return null;

  let label: string;
  let color: string;
  if (sourceCount >= 5) {
    label = "Strong evidence";
    color = "text-emerald-400/70 border-emerald-500/20";
  } else if (sourceCount >= 3) {
    label = "Moderate evidence";
    color = "text-blue-400/70 border-blue-500/20";
  } else {
    label = "Limited evidence";
    color = "text-amber-400/70 border-amber-500/20";
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}>
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
      </svg>
      {label} ({sourceCount} reviews)
    </span>
  );
}

// ── Loading animation ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white/5 border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-xs text-zinc-500">Analyzing patterns across reviews...</span>
        </div>
      </div>
    </div>
  );
}

// ── Dynamic suggestion generator ─────────────────────────────────────────────

function buildSuggestions(analysis: Analysis | null | undefined, reviewCount?: number): Array<{ label: string; question: string; icon: string }> {
  const suggestions: Array<{ label: string; question: string; icon: string }> = [];

  if (analysis?.pain_points?.length) {
    const topPain = analysis.pain_points[0];
    suggestions.push({
      icon: "🔬",
      label: "Forensic deep-dive",
      question: `Dissect "${topPain.title}" — what exactly are people saying, how intensely do they feel, and are the complaints getting worse over time?`,
    });
  }

  if (analysis?.themes?.length && analysis.themes.length > 1) {
    suggestions.push({
      icon: "⚡",
      label: "Contradiction hotspots",
      question: "Where do reviewers directly contradict each other? Find features that some love and others despise — and what explains the divide.",
    });
  }

  if (analysis?.highlights?.length) {
    suggestions.push({
      icon: "🧬",
      label: "Loyalty DNA",
      question: "What separates passionate advocates from satisfied-but-silent users? What language and details do loyal fans use that casual users don't?",
    });
  }

  if (analysis?.sentiment_distribution) {
    const neg = analysis.sentiment_distribution.negative || 0;
    const total = Object.values(analysis.sentiment_distribution).reduce((a, b) => a + b, 0);
    if (neg > 0 && total > 0) {
      const negPct = Math.round((neg / total) * 100);
      suggestions.push({
        icon: "🎯",
        label: `${negPct}% negative — why?`,
        question: "Are the negative reviews about the same core issue, or are complaints scattered across many topics? What's the single biggest leverage point?",
      });
    }
  }

  if (analysis?.sentiment_distribution) {
    const pos = analysis.sentiment_distribution.positive || 0;
    const mixed = analysis.sentiment_distribution.mixed || 0;
    if (pos > 0 && mixed > 0) {
      suggestions.push({
        icon: "⚠️",
        label: "Hidden risk signals",
        question: "Find the 'frustrated loyalists' — users who rate highly but write with disappointment or caveats. What are they close to leaving over?",
      });
    }
  }

  if (reviewCount && reviewCount > 50) {
    suggestions.push({
      icon: "📈",
      label: "Temporal velocity",
      question: "How has sentiment shifted over time? Are things accelerating — better or worse — and what triggered the change?",
    });
  }

  suggestions.push({
    icon: "🧠",
    label: "Surprise me",
    question: "What's the most counterintuitive or unexpected pattern in these reviews — something I'd never notice reading them individually?",
  });

  return suggestions.slice(0, 6);
}

// ── Main ChatPanel ───────────────────────────────────────────────────────────

export function ChatPanel({ projectId, analysis, reviewCount, productName }: ChatPanelProps) {
  const { messages, loading, send, clearHistory } = useChat(projectId);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(
    () => buildSuggestions(analysis, reviewCount),
    [analysis, reviewCount]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = (text?: string) => {
    const msg = text || input;
    if (!msg.trim()) return;
    send(msg);
    setInput("");
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Find the last assistant message's follow-ups (to show at bottom)
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === "assistant");
  const activeFollowUps = !loading && lastAssistantMsg?.followUps?.length
    ? lastAssistantMsg.followUps
    : [];

  return (
    <div className="flex h-[700px] flex-col glass rounded-xl overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-3">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-zinc-200">Review Intelligence</span>
          <span className="text-[10px] text-zinc-500 leading-tight">
            {reviewCount ? `${reviewCount.toLocaleString()} reviews analyzed` : "Ready"}
            {productName ? ` · ${productName}` : ""}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors px-2 py-1 rounded hover:bg-white/5"
            >
              Clear
            </button>
          )}
          <Badge variant="outline" className="text-[10px] border-indigo-500/20 text-indigo-400/70">
            Evidence-locked
          </Badge>
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {messages.length === 0 && (
          <EmptyState
            suggestions={suggestions}
            onSend={handleSend}
            productName={productName}
            analysis={analysis}
          />
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            onFollowUp={handleSend}
            isLast={i === messages.length - 1}
          />
        ))}

        {loading && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* ── Follow-up suggestions ──────────────────────────────────────── */}
      {activeFollowUps.length > 0 && (
        <div className="border-t border-white/5 bg-white/[0.01] px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-600">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Dig deeper</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeFollowUps.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-zinc-400 hover:bg-indigo-500/10 hover:border-indigo-500/20 hover:text-indigo-300 transition-all max-w-[300px] truncate"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input ──────────────────────────────────────────────────────── */}
      <div className="border-t border-white/5 bg-white/[0.02] p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about patterns, contradictions, psychology, trends..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all"
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            size="md"
            className="rounded-xl px-4"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state with contextual suggestions ──────────────────────────────────

function EmptyState({
  suggestions,
  onSend,
  productName,
  analysis,
}: {
  suggestions: Array<{ label: string; question: string; icon: string }>;
  onSend: (q: string) => void;
  productName?: string | null;
  analysis?: Analysis | null;
}) {
  // Quick stats from analysis
  const stats = useMemo(() => {
    if (!analysis) return null;
    const dist = analysis.sentiment_distribution || {};
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    const pos = dist.positive || 0;
    const neg = dist.negative || 0;
    const mixed = dist.mixed || 0;
    return {
      positivePct: Math.round((pos / total) * 100),
      negativePct: Math.round((neg / total) * 100),
      mixedPct: Math.round((mixed / total) * 100),
      themeCount: analysis.themes?.length || 0,
      painPointCount: analysis.pain_points?.length || 0,
    };
  }, [analysis]);

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-6 py-4">
      {/* Icon + headline */}
      <div className="text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">
            {productName ? `Deep-dive into ${productName}` : "Review Intelligence"}
          </h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto leading-relaxed">
            I find the patterns, contradictions, and psychological signals that are invisible
            when reading reviews one by one. Every answer is grounded in evidence.
          </p>
        </div>
      </div>

      {/* Quick stats chips */}
      {stats && (
        <div className="flex flex-wrap justify-center gap-2">
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[11px] text-emerald-400">
            {stats.positivePct}% positive
          </span>
          <span className="rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-1 text-[11px] text-red-400">
            {stats.negativePct}% negative
          </span>
          {stats.mixedPct > 0 && (
            <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[11px] text-amber-400">
              {stats.mixedPct}% mixed signals
            </span>
          )}
          {stats.themeCount > 0 && (
            <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 text-[11px] text-violet-400">
              {stats.themeCount} themes
            </span>
          )}
          {stats.painPointCount > 0 && (
            <span className="rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 text-[11px] text-rose-400">
              {stats.painPointCount} pain points
            </span>
          )}
        </div>
      )}

      {/* Suggestion cards */}
      <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onSend(s.question)}
            className="group rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition-all hover:bg-white/5 hover:border-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/5"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{s.icon}</span>
              <span className="text-[11px] font-medium text-zinc-300 group-hover:text-indigo-300 transition-colors">
                {s.label}
              </span>
            </div>
            <p className="text-[10px] text-zinc-600 line-clamp-2 leading-relaxed">
              {s.question}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Guardrail indicator ─────────────────────────────────────────────────────

const GUARDRAIL_LABELS: Record<string, { label: string; icon: string }> = {
  off_topic: {
    label: "Redirected — outside review scope",
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  },
  no_relevant_reviews: {
    label: "No matching reviews found",
    icon: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01",
  },
  hallucination_detected: {
    label: "Response filtered for accuracy",
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  },
};

// ── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onFollowUp,
  isLast,
}: {
  msg: ChatMessage;
  onFollowUp: (q: string) => void;
  isLast: boolean;
}) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const sourceCount = msg.sources?.length || 0;

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          <div className="rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm text-white whitespace-pre-wrap shadow-lg shadow-indigo-500/10">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  const guardrail = msg.guardrailCategory
    ? GUARDRAIL_LABELS[msg.guardrailCategory]
    : null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {/* Guardrail indicator */}
        {msg.guardrailTriggered && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/15 w-fit">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
              <path d={guardrail?.icon || "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"} />
            </svg>
            <span className="text-[11px] text-amber-400 font-medium">
              {guardrail?.label || "Scope guard activated"}
            </span>
          </div>
        )}

        {/* Response body */}
        <div className="rounded-2xl rounded-bl-sm bg-white/[0.03] text-zinc-300 border border-white/5 px-4 py-3 text-sm">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
              em: ({ children }) => <em className="text-zinc-400 italic">{children}</em>,
              ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-3 space-y-1.5">{children}</ol>,
              ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-3 space-y-1.5">{children}</ul>,
              li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-indigo-500/30 pl-3 my-2 text-zinc-400 italic">
                  {children}
                </blockquote>
              ),
              h1: ({ children }) => <h1 className="text-base font-bold text-zinc-100 mt-3 mb-1.5">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-bold text-zinc-100 mt-3 mb-1.5">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mt-2 mb-1">{children}</h3>,
              hr: () => <hr className="border-white/5 my-3" />,
              code: ({ children }) => (
                <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-indigo-300 font-mono">
                  {children}
                </code>
              ),
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>

        {/* Evidence strength + source citations */}
        {sourceCount > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 ml-1">
              <button
                onClick={() => setSourcesExpanded(!sourcesExpanded)}
                className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-400 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform ${sourcesExpanded ? "rotate-90" : ""}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span>{sourceCount} source{sourceCount > 1 ? "s" : ""} referenced</span>
              </button>
              <EvidenceStrength sourceCount={sourceCount} />
            </div>
            {sourcesExpanded && (
              <div className="space-y-1.5 ml-1 animate-in slide-in-from-top-1 duration-200">
                {msg.sources!.map((src, si) => (
                  <SourceCard key={si} source={src} index={si + 1} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
