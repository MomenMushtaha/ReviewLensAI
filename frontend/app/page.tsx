"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UrlInputForm } from "@/components/UrlInputForm";
import { AnalysisItem } from "@/components/AnalysisItem";

interface RecentAnalysis {
  id: string;
  product_name: string | null;
  review_count: number;
  created_at: string;
}

const FEATURES = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
    ),
    label: "Sentiment Analysis",
    desc: "VADER + star-rating override",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>
    ),
    label: "Theme Clustering",
    desc: "TF-IDF + KMeans discovery",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
    ),
    label: "Rating Trends",
    desc: "Monthly averages over time",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    ),
    label: "Guardrailed Q&A",
    desc: "RAG chat with 3-layer safety",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [recent, setRecent] = useState<RecentAnalysis[]>([]);
  const [activePipelines, setActivePipelines] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("recent_analyses") || "[]");
      setRecent(stored);
    } catch {}
  }, []);

  const handlePipelineStarted = useCallback((projectId: string, mode: "quick" | "deep") => {
    const entry: RecentAnalysis = {
      id: projectId,
      product_name: null,
      review_count: 0,
      created_at: new Date().toISOString(),
    };
    setRecent((prev) => {
      const updated = [entry, ...prev].slice(0, 10);
      localStorage.setItem("recent_analyses", JSON.stringify(updated));
      return updated;
    });

    if (mode === "quick") {
      // Quick mode: navigate to project page with loading indicator (old behavior)
      router.push(`/project/${projectId}?loading=true`);
    } else {
      // Deep mode: track inline progress on homepage
      setActivePipelines((prev) => new Set(prev).add(projectId));
    }
  }, [router]);

  const handlePipelineComplete = useCallback((projectId: string, productName: string | null, reviewCount: number) => {
    setActivePipelines((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
    setRecent((prev) => {
      const updated = prev.map((r) =>
        r.id === projectId
          ? { ...r, product_name: productName || r.product_name, review_count: reviewCount }
          : r
      );
      localStorage.setItem("recent_analyses", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handlePipelineError = useCallback((projectId: string) => {
    setActivePipelines((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
    setRecent((prev) => {
      const updated = prev.filter((r) => r.id !== projectId);
      localStorage.setItem("recent_analyses", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleDelete = useCallback((projectId: string) => {
    setRecent((prev) => {
      const updated = prev.filter((r) => r.id !== projectId);
      localStorage.setItem("recent_analyses", JSON.stringify(updated));
      return updated;
    });
    setActivePipelines((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen mesh-gradient flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-sm bg-indigo-400" />
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">ReviewLens</span>
          </div>
          <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[10px] font-medium text-zinc-400 uppercase tracking-widest">
            AI
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16 flex-1">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 mb-6">
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse-dot" />
            <span className="text-xs font-medium text-indigo-300">AI-Powered Review Intelligence</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl gradient-text text-balance">
            Understand what your
            <br />
            customers really think
          </h1>
          <p className="mt-4 text-zinc-500 max-w-lg mx-auto text-sm leading-relaxed">
            Paste a Trustpilot URL or upload a CSV. Get sentiment analysis, theme discovery,
            rating trends, and a guardrailed AI assistant — all in minutes.
          </p>
        </div>

        {/* Form */}
        <div className="glass rounded-2xl p-8 glow-accent">
          <UrlInputForm onPipelineStarted={handlePipelineStarted} />
        </div>

        {/* Features */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="group glass glass-hover rounded-xl p-4 text-center transition-all duration-200 cursor-default"
            >
              <div className="mx-auto mb-2 h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-indigo-400 group-hover:text-indigo-300 transition-colors">
                {f.icon}
              </div>
              <p className="text-xs font-medium text-zinc-300">{f.label}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Recent analyses */}
        {(recent.length > 0 || activePipelines.size > 0) && (
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Recent Analyses</h2>
              <div className="flex-1 h-px bg-white/5" />
            </div>
            <div className="space-y-2">
              {recent.map((r) => (
                <AnalysisItem
                  key={r.id}
                  id={r.id}
                  productName={r.product_name}
                  createdAt={r.created_at}
                  isActive={activePipelines.has(r.id)}
                  onComplete={handlePipelineComplete}
                  onError={handlePipelineError}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between">
          <p className="text-[10px] text-zinc-600">Built with Claude Code</p>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-zinc-600">All systems operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
