"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getProject, getProjectAnalysis } from "@/lib/api";
import { PipelineProgress } from "@/components/PipelineProgress";
import { SentimentChart } from "@/components/SentimentChart";
import { TrendChart } from "@/components/TrendChart";
import { ThemeCard } from "@/components/ThemeCard";
import {
  SummaryCard,
  PainPointsList,
  HighlightsList,
  RecommendationsList,
} from "@/components/SummaryCard";
import { ReviewTable } from "@/components/ReviewTable";
import { ChatPanel } from "@/components/ChatPanel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { Project, Analysis } from "@/types";

export default function ProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const isLoading = searchParams.get("loading") === "true";
  const [project, setProject] = useState<Project | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    loadData();
  }, [projectId, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      const [proj, anal] = await Promise.all([
        getProject(projectId),
        getProjectAnalysis(projectId).catch(() => null),
      ]);
      setProject(proj);
      setAnalysis(anal);
      try {
        const recent = JSON.parse(localStorage.getItem("recent_analyses") || "[]");
        const idx = recent.findIndex((r: { id: string }) => r.id === projectId);
        if (idx !== -1) {
          recent[idx].product_name = proj.product_name;
          recent[idx].review_count = proj.review_count;
          localStorage.setItem("recent_analyses", JSON.stringify(recent));
        }
      } catch {}
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to load project");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header project={null} />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <PipelineProgress projectId={projectId} />
        </main>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header project={null} />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="text-sm font-medium text-red-700">Error loading project</p>
            <p className="mt-1 text-sm text-red-600">{fetchError}</p>
          </div>
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header project={null} />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-200 rounded w-1/4" />
            <div className="h-64 bg-gray-200 rounded" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header project={project} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="themes">Themes</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            {analysis ? (
              <>
                {analysis.executive_summary && (
                  <SummaryCard summary={analysis.executive_summary} />
                )}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Sentiment Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SentimentChart distribution={analysis.sentiment_distribution} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Rating Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TrendChart data={analysis.trend_data} />
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <PainPointsList items={analysis.pain_points} />
                  <HighlightsList items={analysis.highlights} />
                </div>
                <RecommendationsList items={analysis.recommendations} />
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-gray-400">
                  Analysis not yet available
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Reviews */}
          <TabsContent value="reviews">
            <ReviewTable projectId={projectId} />
          </TabsContent>

          {/* Themes */}
          <TabsContent value="themes">
            {analysis?.themes?.length ? (
              <div className="space-y-6">
                {/* Summary header */}
                <div className="flex flex-wrap items-center gap-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {analysis.themes.length} Themes Discovered
                  </h2>
                  <div className="flex gap-2">
                    {Object.entries(
                      analysis.themes.reduce<Record<string, number>>((acc, t) => {
                        acc[t.sentiment] = (acc[t.sentiment] || 0) + 1;
                        return acc;
                      }, {})
                    ).map(([sentiment, count]) => {
                      const colors: Record<string, string> = {
                        positive: "bg-emerald-100 text-emerald-700",
                        negative: "bg-red-100 text-red-700",
                        neutral: "bg-gray-100 text-gray-600",
                        mixed: "bg-amber-100 text-amber-700",
                      };
                      return (
                        <span
                          key={sentiment}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                            colors[sentiment] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {count} {sentiment}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Theme cards grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {analysis.themes.map((theme, i) => (
                    <ThemeCard
                      key={`theme-${i}`}
                      theme={theme}
                      maxReviews={Math.max(...analysis.themes.map((t) => t.review_count))}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-gray-400">
                  No themes available
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Chat */}
          <TabsContent value="chat">
            <ChatPanel projectId={projectId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Header({ project }: { project: Project | null }) {
  return (
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-3">
        <a
          href="/"
          className="text-lg font-bold text-gray-900 hover:text-indigo-600 transition-colors"
        >
          ReviewLens AI
        </a>
        {project && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-700">
              {project.product_name || "Analysis"}
            </span>
            <Badge variant="outline" className="capitalize">{project.platform}</Badge>
            <span className="text-xs text-gray-400 ml-auto">{project.review_count} reviews</span>
          </>
        )}
      </div>
    </header>
  );
}
