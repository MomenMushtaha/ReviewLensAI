"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { MessageSquare, AlertCircle, Loader2 } from "lucide-react";
import type { Project, Analysis } from "@/types";

function SummaryContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  
  const [project, setProject] = useState<Project | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-sm font-medium text-foreground mb-2">No project selected</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Import reviews first to see analysis results
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
    <>
      {/* Project Header */}
      {project && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">
              {project.product_name || "Analysis"}
            </h2>
            <Badge variant="outline" className="capitalize">
              {project.platform}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {project.review_count} reviews
            </span>
          </div>
          <Link href={`/qa?projectId=${projectId}`}>
            <Button variant="secondary" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Ask Questions
            </Button>
          </Link>
        </div>
      )}

      {/* Analysis Content */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="themes">Themes</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {analysis ? (
            <>
              {analysis.executive_summary && (
                <SummaryCard summary={analysis.executive_summary} />
              )}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Sentiment Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SentimentChart distribution={analysis.sentiment_distribution} />
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rating Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TrendChart data={analysis.trend_data} />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PainPointsList items={analysis.pain_points} />
                <HighlightsList items={analysis.highlights} />
              </div>

              <RecommendationsList items={analysis.recommendations} />
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Analysis not yet available. Processing may take a few moments.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="themes">
          {analysis?.themes?.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {analysis.themes.map((theme) => (
                <ThemeCard key={theme.cluster_id} theme={theme} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No themes available yet
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reviews">
          <ReviewTable projectId={projectId} />
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function SummaryPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View sentiment analysis, themes, and trends
          </p>
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }>
          <SummaryContent />
        </Suspense>
      </main>
    </div>
  );
}
