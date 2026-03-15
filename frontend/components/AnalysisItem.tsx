"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePipelineSSE } from "@/hooks/usePipelineSSE";
import { formatDate } from "@/lib/utils";
import { deleteProject, cancelPipeline } from "@/lib/api";

const STAGES = ["scraping", "ingesting", "analyzing", "summarizing"];

function stageIndex(stage: string): number {
  return STAGES.indexOf(stage);
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

interface AnalysisItemProps {
  id: string;
  productName: string | null;
  createdAt: string;
  mode?: "quick" | "deep";
  isActive: boolean;
  onComplete: (projectId: string, productName: string | null, reviewCount: number) => void;
  onError: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

function ActivePipeline({
  projectId,
  onComplete,
  onError,
}: {
  projectId: string;
  onComplete: (productName: string | null, reviewCount: number) => void;
  onError: () => void;
}) {
  const state = usePipelineSSE(projectId);
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);

  const handleStop = async () => {
    setStopping(true);
    try { await cancelPipeline(projectId); } catch {}
  };

  useEffect(() => {
    const interval = setInterval(() => setElapsed((Date.now() - startTime) / 1000), 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  useEffect(() => {
    if (state.status === "complete") {
      onComplete(state.productName, state.reviewCount);
    }
    if (state.status === "error") {
      onError();
    }
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentStage = state.status === "running" ? state.stage : "";
  const progress = state.status === "running" ? state.progress : state.status === "complete" ? 100 : 0;
  const message =
    state.status === "running"
      ? state.message
      : state.status === "complete"
      ? `Pipeline complete — ${formatElapsed(elapsed)}`
      : state.status === "error"
      ? state.message
      : "Connecting to pipeline…";

  if (state.status === "error") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-400" />
            <p className="text-sm font-medium text-red-400">Pipeline failed</p>
          </div>
          <span className="text-[10px] text-zinc-600 tabular-nums">{formatElapsed(elapsed)}</span>
        </div>
        <p className="text-xs text-red-300/70 leading-relaxed">{message}</p>
      </div>
    );
  }

  if (state.status === "complete") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-sm font-medium text-emerald-300">Pipeline complete</p>
          </div>
          <span className="text-[10px] text-zinc-500 tabular-nums">{formatElapsed(elapsed)}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-700 w-full" />
          </div>
          <span className="text-[10px] text-emerald-400 tabular-nums w-10 text-right">100%</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STAGES.map((s) => (
            <span key={s} className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
              ✓ {s}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with stage and elapsed time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
          <p className="text-sm font-medium text-zinc-200 capitalize">{currentStage || "Starting"}…</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-600 tabular-nums">{formatElapsed(elapsed)}</span>
          <button
            onClick={handleStop}
            disabled={stopping}
            className="rounded-md px-2 py-0.5 text-[10px] font-medium text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 transition-all disabled:opacity-50"
          >
            {stopping ? "Stopping…" : "Stop"}
          </button>
        </div>
      </div>

      {/* Backend message */}
      <p className="text-xs text-zinc-500 leading-relaxed">{message}</p>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-500 shadow-lg shadow-indigo-500/30"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-zinc-600 tabular-nums w-10 text-right">{progress}%</span>
      </div>

      {/* Stage pills */}
      <div className="flex gap-1.5 flex-wrap">
        {STAGES.map((s) => {
          const idx = stageIndex(s);
          const currIdx = stageIndex(currentStage);
          const done = currIdx > idx;
          const active = s === currentStage;
          return (
            <span
              key={s}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-all ${
                done
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                  : active
                  ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 animate-pulse"
                  : "bg-white/5 text-zinc-600 border border-white/10"
              }`}
            >
              {done ? "✓ " : ""}{s}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function AnalysisItem({
  id,
  productName,
  createdAt,
  mode,
  isActive,
  onComplete,
  onError,
  onDelete,
}: AnalysisItemProps) {
  const router = useRouter();

  if (isActive) {
    return (
      <div className="glass rounded-xl px-4 py-4 transition-all duration-200 border border-indigo-500/10">
        <ActivePipeline
          projectId={id}
          onComplete={(name, count) => onComplete(id, name, count)}
          onError={() => onError(id)}
        />
      </div>
    );
  }

  return (
    <div className="glass glass-hover rounded-xl px-4 py-3 flex items-center justify-between transition-all duration-200">
      <button
        onClick={() => router.push(`/project/${id}`)}
        className="flex-1 text-left group"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
            {productName || "Analysis"}
          </p>
          {mode && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
              mode === "deep"
                ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
            }`}>
              {mode === "deep" ? "Deep" : "Quick"}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-600">{formatDate(createdAt)}</p>
      </button>
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (!confirm("Delete this analysis? This cannot be undone.")) return;
          try { await deleteProject(id); } catch {}
          onDelete(id);
        }}
        className="rounded-lg p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 transition-all"
        title="Delete analysis"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        </svg>
      </button>
    </div>
  );
}
