"use client";
import { useState, useEffect } from "react";

export type PipelineState =
  | { status: "idle" }
  | { status: "running"; stage: string; progress: number; message: string }
  | { status: "complete"; projectId: string }
  | { status: "error"; message: string };

export function usePipelineSSE(projectId: string | null): PipelineState {
  const [state, setState] = useState<PipelineState>({ status: "idle" });

  useEffect(() => {
    if (!projectId) {
      setState({ status: "idle" });
      return;
    }

    // For now, simulate completion since we don't have SSE endpoint
    // In production, this would connect to an SSE endpoint
    setState({ 
      status: "running", 
      stage: "analyzing", 
      progress: 50, 
      message: "Processing reviews..." 
    });

    const timer = setTimeout(() => {
      setState({ status: "complete", projectId });
    }, 2000);

    return () => clearTimeout(timer);
  }, [projectId]);

  return state;
}
