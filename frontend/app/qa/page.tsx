"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatPanel } from "@/components/ChatPanel";
import { getProject } from "@/lib/api";
import { AlertCircle, Loader2, BarChart3, Shield } from "lucide-react";
import type { Project } from "@/types";

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
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-sm font-medium text-foreground mb-2">No project selected</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Import reviews first to start asking questions
          </p>
          <Link href="/import">
            <Button variant="secondary">Import Reviews</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
          <h3 className="text-sm font-medium text-foreground mb-2">Error loading project</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Sidebar */}
      <div className="lg:col-span-1 space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {project?.product_name || "Analysis"}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {project?.platform}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{project?.review_count} reviews</span>
              <span>-</span>
              <Badge variant="outline" className="text-xs">Active</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-success" />
              <span className="text-sm font-medium text-foreground">Guardrails Active</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This chat is scoped to the review data only. The AI will not answer questions
              outside the context of the imported reviews.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h4 className="text-sm font-medium text-foreground mb-3">Example Questions</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>What are the main complaints?</li>
              <li>What do customers love most?</li>
              <li>How has sentiment changed over time?</li>
              <li>What improvements do users suggest?</li>
              <li>Are there issues with pricing?</li>
            </ul>
          </CardContent>
        </Card>

        <Link href={`/summary?projectId=${projectId}`}>
          <Button variant="outline" className="w-full">
            View Summary
          </Button>
        </Link>
      </div>

      {/* Chat Panel */}
      <div className="lg:col-span-3">
        <ChatPanel projectId={projectId} />
      </div>
    </div>
  );
}

export default function QAPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Q&A Assistant</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ask questions about your review data with guardrailed AI
          </p>
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }>
          <QAContent />
        </Suspense>
      </main>
    </div>
  );
}
