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
      console.log("[v0] Pipeline error:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError("Cannot connect to backend API. Please ensure the backend server is running.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to start pipeline");
      }
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
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
        {(["url", "csv"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:text-gray-700"
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
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400">Example: https://www.trustpilot.com/review/airbnb.com</p>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300"
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
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-600">Drop CSV here or click to browse</p>
              <p className="text-xs text-gray-400">Required: body/review/text column. Optional: rating, date, reviewer_name</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <Button onClick={handleSubmit} loading={loading} className="mt-4 w-full" size="lg">
        Analyze Reviews
      </Button>
    </div>
  );
}
