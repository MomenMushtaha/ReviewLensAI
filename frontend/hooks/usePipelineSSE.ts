"use client";
import { useEffect, useRef, useState } from "react";
import { getPipelineSSEUrl } from "@/lib/api";

export type PipelineState =
  | { status: "connecting" }
  | { status: "running"; stage: string; progress: number; message: string }
  | { status: "complete"; projectId: string; reviewCount: number }
  | { status: "error"; message: string };

export function usePipelineSSE(projectId: string | null): PipelineState {
  const [state, setState] = useState<PipelineState>({ status: "connecting" });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const es = new EventSource(getPipelineSSEUrl(projectId));
    esRef.current = es;

    es.addEventListener("progress", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState({ status: "running", stage: data.stage, progress: data.progress, message: data.message });
    });

    es.addEventListener("complete", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState({ status: "complete", projectId: data.project_id, reviewCount: data.review_count });
      es.close();
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState({ status: "error", message: data.message });
      } catch {
        setState({ status: "error", message: "Pipeline failed" });
      }
      es.close();
    });

    es.onerror = () => {
      setState({ status: "error", message: "Connection lost" });
      es.close();
    };

    return () => es.close();
  }, [projectId]);

  return state;
}
