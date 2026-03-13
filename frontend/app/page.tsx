"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Plus, BarChart3, MessageSquare, TrendingUp, FileText } from "lucide-react";

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
    avgSentiment: 0,
  });

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("recent_analyses") || "[]");
      setProjects(stored);
      
      const totalReviews = stored.reduce((acc: number, p: RecentProject) => acc + (p.review_count || 0), 0);
      setStats({
        totalProjects: stored.length,
        totalReviews,
        avgSentiment: stored.length > 0 ? 3.8 : 0,
      });
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Overview of your review analysis projects
            </p>
          </div>
          <Link href="/import">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Analysis
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalProjects}</p>
                  <p className="text-xs text-muted-foreground">Total Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-info/10">
                  <MessageSquare className="h-5 w-5 text-info" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalReviews.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Reviews</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-success/10">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {stats.avgSentiment > 0 ? stats.avgSentiment.toFixed(1) : "-"}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg. Rating</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-warning/10">
                  <BarChart3 className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">12</p>
                  <p className="text-xs text-muted-foreground">Themes Found</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Projects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Projects</CardTitle>
            {projects.length > 0 && (
              <Link href="/import" className="text-sm text-primary hover:underline">
                View All
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">No projects yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Get started by importing reviews from Trustpilot or uploading a CSV
                </p>
                <Link href="/import">
                  <Button variant="secondary" size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Import Reviews
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/summary?projectId=${project.id}`}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <BarChart3 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {project.product_name || "Untitled Analysis"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {project.review_count} reviews - {formatDate(project.created_at)}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {project.id.slice(0, 8)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
