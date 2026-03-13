"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { 
  Plus, BarChart3, MessageSquare, TrendingUp, FileText, 
  ArrowRight, Sparkles, Globe, Upload
} from "lucide-react";

interface RecentProject {
  id: string;
  product_name: string | null;
  review_count: number;
  created_at: string;
  platform?: string;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalReviews: 0,
    avgRating: 0,
    themesFound: 0,
  });

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("recent_analyses") || "[]");
      setProjects(stored);
      
      const totalReviews = stored.reduce((acc: number, p: RecentProject) => acc + (p.review_count || 0), 0);
      setStats({
        totalProjects: stored.length,
        totalReviews,
        avgRating: stored.length > 0 ? 3.8 : 0,
        themesFound: stored.length * 4,
      });
    } catch {}
  }, []);

  const hasProjects = projects.length > 0;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <Navigation />
      
      {/* Hero gradient */}
      <div className="absolute inset-x-0 top-16 h-[500px] gradient-bg pointer-events-none" />
      
      <main className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Section */}
        <div className="mb-12">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--primary))] mb-2">Dashboard</p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))]">
                {hasProjects ? "Welcome back" : "Get started"}
              </h1>
              <p className="text-[hsl(var(--muted-foreground))] mt-2 max-w-lg">
                {hasProjects 
                  ? "Here's an overview of your review analysis projects and insights."
                  : "Import customer reviews to unlock AI-powered sentiment analysis, theme clustering, and intelligent Q&A."
                }
              </p>
            </div>
            <Link href="/import">
              <Button className="gap-2 h-11 px-6 glow-sm">
                <Plus className="h-4 w-4" />
                New Analysis
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {[
            { label: "Projects", value: stats.totalProjects, icon: FileText, color: "primary" },
            { label: "Reviews Analyzed", value: stats.totalReviews.toLocaleString(), icon: MessageSquare, color: "info" },
            { label: "Avg. Rating", value: stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—", icon: TrendingUp, color: "positive" },
            { label: "Themes Found", value: stats.themesFound || "—", icon: BarChart3, color: "chart-4" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="group relative overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all hover:border-[hsl(var(--border-hover))] hover:bg-[hsl(var(--card-hover))]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
                    {stat.value}
                  </p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{stat.label}</p>
                </div>
                <div className={`rounded-lg p-2 bg-[hsl(var(--${stat.color})/0.1)]`}>
                  <stat.icon className={`h-5 w-5 text-[hsl(var(--${stat.color}))]`} />
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-[hsl(var(--${stat.color}))] to-transparent opacity-0 transition-opacity group-hover:opacity-100`} />
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Projects */}
          <div className="lg:col-span-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))]">
              <h2 className="font-semibold text-[hsl(var(--foreground))]">Recent Projects</h2>
              {hasProjects && (
                <Link href="/import" className="text-sm text-[hsl(var(--primary))] hover:underline">
                  View all
                </Link>
              )}
            </div>
            
            {!hasProjects ? (
              <div className="flex flex-col items-center justify-center py-16 px-6">
                <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--secondary))] flex items-center justify-center mb-6">
                  <Sparkles className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
                </div>
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2">No projects yet</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] text-center max-w-sm mb-6">
                  Import reviews from Trustpilot or upload a CSV to start analyzing customer feedback with AI.
                </p>
                <div className="flex gap-3">
                  <Link href="/import">
                    <Button variant="secondary" className="gap-2">
                      <Globe className="h-4 w-4" />
                      From URL
                    </Button>
                  </Link>
                  <Link href="/import">
                    <Button variant="secondary" className="gap-2">
                      <Upload className="h-4 w-4" />
                      Upload CSV
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[hsl(var(--border))]">
                {projects.slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    href={`/summary?projectId=${project.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-[hsl(var(--secondary)/0.5)] transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--info))] flex items-center justify-center">
                        <span className="text-sm font-bold text-white">
                          {(project.product_name || "U")[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-[hsl(var(--foreground))]">
                          {project.product_name || "Untitled Analysis"}
                        </p>
                        <p className="text-sm text-[hsl(var(--muted-foreground))]">
                          {project.review_count} reviews · {formatDate(project.created_at)}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
              <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Link href="/import" className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary-hover))] transition-colors group">
                  <div className="w-10 h-10 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center">
                    <Globe className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-[hsl(var(--foreground))]">Scrape Trustpilot</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Import from URL</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
                
                <Link href="/import" className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary-hover))] transition-colors group">
                  <div className="w-10 h-10 rounded-lg bg-[hsl(var(--info))] flex items-center justify-center">
                    <Upload className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-[hsl(var(--foreground))]">Upload CSV</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Bulk import reviews</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
                
                {hasProjects && (
                  <Link href="/qa" className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary-hover))] transition-colors group">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(var(--positive))] flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-[hsl(var(--foreground))]">Ask AI</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Chat with your data</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                )}
              </div>
            </div>

            {/* Capabilities Card */}
            <div className="rounded-xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--primary)/0.1)] to-transparent p-6">
              <h3 className="font-semibold text-[hsl(var(--foreground))] mb-3">AI Capabilities</h3>
              <ul className="space-y-2.5 text-sm text-[hsl(var(--muted-foreground))]">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--positive))]" />
                  Sentiment Analysis
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--info))]" />
                  Theme Clustering
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--chart-4))]" />
                  Trend Detection
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />
                  Guardrailed Q&A
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
