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
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm font-medium text-red-700">Pipeline failed</p>
        <p className="mt-1 text-sm text-red-600">{state.message}</p>
      </div>
    );
  }

  const currentStage = state.status === "running" ? state.stage : state.status === "complete" ? "done" : "";
  const progress = state.status === "running" ? state.progress : state.status === "complete" ? 100 : 0;
  const message =
    state.status === "running"
      ? state.message
      : state.status === "complete"
      ? "Pipeline complete! Redirecting…"
      : "Connecting…";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Analyzing reviews…</h2>
        <p className="mt-1 text-sm text-gray-500">{message}</p>
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
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                done
                  ? "bg-emerald-100 text-emerald-700"
                  : active
                  ? "bg-indigo-100 text-indigo-700 animate-pulse"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {done ? "✓ " : ""}{s}
            </span>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-600 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 text-right">{progress}%</p>
    </div>
  );
}
