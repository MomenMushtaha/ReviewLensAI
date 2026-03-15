"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UrlInputForm } from "@/components/UrlInputForm";
import { deleteProject } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface RecentAnalysis {
  id: string;
  product_name: string | null;
  review_count: number;
  created_at: string;
}

export default function HomePage() {
  const router = useRouter();
  const [recent, setRecent] = useState<RecentAnalysis[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("recent_analyses") || "[]");
      setRecent(stored);
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center gap-3">
          <span className="text-xl font-bold text-gray-900">ReviewLens AI</span>
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            Review Intelligence Portal
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Hero */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Understand what your customers really think
          </h1>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            Paste a Trustpilot URL or upload a CSV to get AI-powered analysis: sentiment, themes,
            trends, and a guardrailed Q&amp;A assistant — all in minutes.
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <UrlInputForm />
        </div>

        {/* Feature bullets */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: "🔍", label: "Sentiment Analysis" },
            { icon: "🏷️", label: "Theme Clustering" },
            { icon: "📈", label: "Rating Trends" },
            { icon: "💬", label: "Guardrailed Q&A" },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-gray-100 bg-white p-4 text-center">
              <div className="text-2xl mb-1">{f.icon}</div>
              <p className="text-xs font-medium text-gray-600">{f.label}</p>
            </div>
          ))}
        </div>

        {/* Recent analyses */}
        {recent.length > 0 && (
          <div className="mt-10">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Analyses</h2>
            <div className="space-y-2">
              {recent.map((r) => (
                <div
                  key={r.id}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-3 hover:border-indigo-200 transition-colors"
                >
                  <button
                    onClick={() => router.push(`/project/${r.id}`)}
                    className="flex-1 text-left"
                  >
                    <p className="text-sm font-medium text-gray-800">
                      {r.product_name || "Analysis"}
                    </p>
                    <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{r.id.slice(0, 8)}…</span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm("Delete this analysis? This cannot be undone.")) return;
                        try {
                          await deleteProject(r.id);
                        } catch {}
                        const updated = recent.filter((a) => a.id !== r.id);
                        setRecent(updated);
                        localStorage.setItem("recent_analyses", JSON.stringify(updated));
                      }}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Delete analysis"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
