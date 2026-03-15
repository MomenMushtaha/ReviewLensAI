"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePipelineSSE } from "@/hooks/usePipelineSSE";

const STAGES = ["scraping", "ingesting", "analyzing", "summarizing"];

function stageIndex(stage: string): number {
  return STAGES.indexOf(stage);
}

export function PipelineProgress({ projectId }: { projectId: string }) {
  const router = useRouter();
  const state = usePipelineSSE(projectId);

  useEffect(() => {
    if (state.status === "complete") {
      const t = setTimeout(() => {
        router.replace(`/project/${projectId}`);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [state, projectId, router]);

  if (state.status === "error") {
    return (
      <div className="glass rounded-xl border-red-500/20 p-6">
        <p className="text-sm font-medium text-red-400">Pipeline failed</p>
        <p className="mt-1 text-sm text-red-300">{state.message}</p>
      </div>
    );
  }

  const currentStage = state.status === "running" ? state.stage : state.status === "complete" ? "done" : "";
  const progress = state.status === "running" ? state.progress : state.status === "complete" ? 100 : 0;
  const message =
    state.status === "running"
      ? state.message
      : state.status === "complete"
      ? "Pipeline complete! Redirecting..."
      : "Connecting...";

  return (
    <div className="glass rounded-xl p-6 space-y-6 glow-sm">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">Analyzing reviews...</h2>
        <p className="mt-1 text-sm text-zinc-500">{message}</p>
      </div>

      {/* Stage pills */}
      <div className="flex gap-2 flex-wrap">
        {STAGES.map((s) => {
          const idx = stageIndex(s);
          const currIdx = stageIndex(currentStage);
          const done = currIdx > idx || state.status === "complete";
          const active = s === currentStage;
          return (
            <span
              key={s}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-all ${
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

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500 shadow-lg shadow-indigo-500/30"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-zinc-600 text-right">{progress}%</p>
    </div>
  );
}
