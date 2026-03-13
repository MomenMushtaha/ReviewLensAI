"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SentimentChart } from "@/components/SentimentChart";
import { TrendChart } from "@/components/TrendChart";
import { ThemeCard } from "@/components/ThemeCard";
import { ReviewTable } from "@/components/ReviewTable";
import {
  SummaryCard,
  PainPointsList,
  HighlightsList,
  RecommendationsList,
} from "@/components/SummaryCard";
import { getProject, getProjectAnalysis } from "@/lib/api";
import { 
  MessageSquare, AlertCircle, Loader2, TrendingUp, TrendingDown, 
  Minus, BarChart3, ListTree, FileText, ArrowRight
} from "lucide-react";
import type { Project, Analysis } from "@/types";

function SummaryContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  
  const [project, setProject] = useState<Project | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "themes" | "reviews">("overview");

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [projectId]);

  const loadData = async () => {
    if (!projectId) return;
    try {
      const [proj, anal] = await Promise.all([
        getProject(projectId),
        getProjectAnalysis(projectId).catch(() => null),
      ]);
      setProject(proj);
      setAnalysis(anal);
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
          <BarChart3 className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
        </div>
        <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2">No project selected</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center max-w-sm mb-6">
          Import reviews first to see AI-powered analysis and insights
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
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading analysis...</p>
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
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6 max-w-sm text-center">{error}</p>
        <div className="flex gap-3">
          <Link href="/dashboard">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
          <button
            onClick={() => loadData()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary)/0.9)] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "themes", label: "Themes", icon: ListTree },
    { id: "reviews", label: "Reviews", icon: FileText },
  ] as const;

  return (
    <>
      {/* Project Header */}
      {project && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--info))] flex items-center justify-center">
              <span className="text-lg font-bold text-white">
                {(project.product_name || "A")[0].toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">
                  {project.product_name || "Analysis"}
                </h2>
                <Badge className="bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border-0 capitalize">
                  {project.platform}
                </Badge>
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
                {project.review_count} reviews analyzed
              </p>
            </div>
          </div>
          <Link href={`/qa?projectId=${projectId}`}>
            <Button className="gap-2 glow-sm">
              <MessageSquare className="h-4 w-4" />
              Ask AI
            </Button>
          </Link>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[hsl(var(--secondary))] w-fit mb-8">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {analysis ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { 
                    label: "Positive", 
                    value: `${analysis.sentiment_distribution?.positive || 0}%`,
                    icon: TrendingUp,
                    color: "positive"
                  },
                  { 
                    label: "Neutral", 
                    value: `${analysis.sentiment_distribution?.neutral || 0}%`,
                    icon: Minus,
                    color: "neutral"
                  },
                  { 
                    label: "Negative", 
                    value: `${analysis.sentiment_distribution?.negative || 0}%`,
                    icon: TrendingDown,
                    color: "negative"
                  },
                  { 
                    label: "Themes", 
                    value: analysis.themes?.length || 0,
                    icon: ListTree,
                    color: "primary"
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <stat.icon className={`h-5 w-5 text-[hsl(var(--${stat.color}))]`} />
                    </div>
                    <p className="text-2xl font-bold text-[hsl(var(--foreground))]">{stat.value}</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">{stat.label}</p>
                  </div>
                ))}
              </div>

              {analysis.executive_summary && (
                <SummaryCard summary={analysis.executive_summary} />
              )}
              
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
                  <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4">Sentiment Distribution</h3>
                  <SentimentChart distribution={analysis.sentiment_distribution} />
                </div>
                
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
                  <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4">Rating Trend</h3>
                  <TrendChart data={analysis.trend_data} />
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <PainPointsList items={analysis.pain_points} />
                <HighlightsList items={analysis.highlights} />
              </div>

              <RecommendationsList items={analysis.recommendations} />
            </>
          ) : (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))] mx-auto mb-4" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Analysis is being processed. This may take a few moments...
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "themes" && (
        <>
          {analysis?.themes?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {analysis.themes.map((theme) => (
                <ThemeCard key={theme.cluster_id} theme={theme} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-12 text-center">
              <ListTree className="h-8 w-8 text-[hsl(var(--muted-foreground))] mx-auto mb-4" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                No themes have been identified yet
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === "reviews" && <ReviewTable projectId={projectId} />}
    </>
  );
}

export default function SummaryPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <Navigation />
      
      <div className="absolute inset-x-0 top-16 h-[300px] gradient-bg pointer-events-none" />
      
      <main className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <p className="text-sm font-medium text-[hsl(var(--primary))] mb-2">Insights</p>
          <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Analysis Summary
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-2">
            AI-powered sentiment analysis, themes, and actionable insights
          </p>
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-[hsl(var(--primary))]" />
          </div>
        }>
          <SummaryContent />
        </Suspense>
      </main>
    </div>
  );
}
