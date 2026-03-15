"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runPipeline } from "@/lib/api";

type Tab = "url" | "csv";

export function UrlInputForm() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      if (tab === "url") {
        if (!url.trim()) {
          setError("Please enter a Trustpilot URL");
          setLoading(false);
          return;
        }
        formData.append("source_type", "url");
        formData.append("url", url.trim());
      } else {
        if (!file) {
          setError("Please select a CSV file");
          setLoading(false);
          return;
        }
        formData.append("source_type", "csv");
        formData.append("file", file);
      }
      const { project_id } = await runPipeline(formData);
      try {
        const recent = JSON.parse(localStorage.getItem("recent_analyses") || "[]");
        recent.unshift({ id: project_id, product_name: null, review_count: 0, created_at: new Date().toISOString() });
        localStorage.setItem("recent_analyses", JSON.stringify(recent.slice(0, 5)));
      } catch {}
      router.push(`/project/${project_id}?loading=true`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start pipeline");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) setFile(f);
    else setError("Please drop a .csv file");
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Tabs */}
      <div className="flex rounded-lg overflow-hidden mb-4 bg-white/5 p-0.5">
        {(["url", "csv"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${
              tab === t
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "url" ? "Trustpilot URL" : "CSV Upload"}
          </button>
        ))}
      </div>

      {tab === "url" ? (
        <div className="space-y-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="https://www.trustpilot.com/review/example.com"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
          />
          <p className="text-xs text-zinc-600">Example: https://www.trustpilot.com/review/airbnb.com</p>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all duration-200 ${
            dragging
              ? "border-indigo-400/50 bg-indigo-500/10"
              : "border-white/10 hover:border-white/20 hover:bg-white/5"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-200">{file.name}</p>
              <p className="text-xs text-zinc-600">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="mx-auto mb-2 h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-zinc-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              </div>
              <p className="text-sm font-medium text-zinc-400">Drop CSV here or click to browse</p>
              <p className="text-xs text-zinc-600">Required: body/review/text column. Optional: rating, date, reviewer_name</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <Button onClick={handleSubmit} loading={loading} className="mt-4 w-full" size="lg">
        Analyze Reviews
      </Button>
    </div>
  );
}
