"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatPanel } from "@/components/ChatPanel";
import { getProject } from "@/lib/api";
import { 
  AlertCircle, Loader2, BarChart3, Shield, MessageSquare, 
  ArrowRight, Sparkles, HelpCircle
} from "lucide-react";
import type { Project } from "@/types";

const exampleQuestions = [
  "What are the main complaints from customers?",
  "What features do customers love the most?",
  "How has sentiment changed over time?",
  "What improvements do users suggest?",
  "Are there recurring issues with pricing?",
  "Summarize the top 3 pain points",
];

function QAContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    if (!projectId) return;
    try {
      const proj = await getProject(projectId);
      setProject(proj);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  };

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--secondary))] flex items-center justify-center mb-6">
          <MessageSquare className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
        </div>
        <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2">No project selected</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center max-w-sm mb-6">
          Import reviews first to start asking questions about your data
        </p>
        <Link href="/import">
          <Button className="gap-2">
            Import Reviews
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-[hsl(var(--primary))] mb-4" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading project...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--negative)/0.1)] flex items-center justify-center mb-6">
          <AlertCircle className="h-8 w-8 text-[hsl(var(--negative))]" />
        </div>
        <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2">Error loading project</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-4 gap-6">
      {/* Sidebar */}
      <div className="lg:col-span-1 space-y-4">
        {/* Project Info */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--info))] flex items-center justify-center">
              <span className="text-sm font-bold text-white">
                {(project?.product_name || "A")[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-[hsl(var(--foreground))]">
                {project?.product_name || "Analysis"}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] capitalize">
                {project?.platform}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-[hsl(var(--positive)/0.1)] text-[hsl(var(--positive))] border-0 text-xs">
              {project?.review_count} reviews
            </Badge>
          </div>
        </div>

        {/* Guardrails Info */}
        <div className="rounded-xl border border-[hsl(var(--positive)/0.2)] bg-[hsl(var(--positive)/0.05)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-5 w-5 text-[hsl(var(--positive))]" />
            <span className="font-medium text-[hsl(var(--foreground))]">Guardrails Active</span>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
            AI responses are scoped to your review data only. Questions outside the context will be declined.
          </p>
        </div>

        {/* Example Questions */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <span className="font-medium text-sm text-[hsl(var(--foreground))]">Try asking</span>
          </div>
          <ul className="space-y-2">
            {exampleQuestions.slice(0, 4).map((question, i) => (
              <li 
                key={i}
                className="text-xs text-[hsl(var(--muted-foreground))] p-2 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary-hover))] cursor-pointer transition-colors"
              >
                {question}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <Link href={`/summary?projectId=${projectId}`}>
          <Button variant="secondary" className="w-full gap-2">
            <BarChart3 className="h-4 w-4" />
            View Insights
          </Button>
        </Link>
      </div>

      {/* Chat Panel */}
      <div className="lg:col-span-3">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden h-[calc(100vh-280px)] min-h-[500px]">
          <ChatPanel projectId={projectId} />
        </div>
      </div>
    </div>
  );
}

export default function QAPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <Navigation />
      
      <div className="absolute inset-x-0 top-16 h-[300px] gradient-bg pointer-events-none" />
      
      <main className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
            <p className="text-sm font-medium text-[hsl(var(--primary))]">AI Assistant</p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Ask about your reviews
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-2">
            Get instant answers from your review data with guardrailed AI
          </p>
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-[hsl(var(--primary))]" />
          </div>
        }>
          <QAContent />
        </Suspense>
      </main>
    </div>
  );
}
