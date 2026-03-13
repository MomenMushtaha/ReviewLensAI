import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PainPoint, Highlight, Recommendation } from "@/types";

export function SummaryCard({ summary }: { summary: string | null }) {
  if (!summary) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Executive Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
      </CardContent>
    </Card>
  );
}

type PainPointInput = PainPoint | string;

export function PainPointsList({ items }: { items: PainPointInput[] }) {
  if (!items?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-red-400">Pain Points</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((p, i) => {
          if (typeof p === 'string') {
            return (
              <div key={i} className="text-sm text-foreground">{p}</div>
            );
          }
          return (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{p.title}</span>
                {p.frequency && <Badge variant="neutral" className="text-xs">{p.frequency}</Badge>}
              </div>
              {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

type HighlightInput = Highlight | string;

export function HighlightsList({ items }: { items: HighlightInput[] }) {
  if (!items?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-emerald-400">Highlights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((h, i) => {
          if (typeof h === 'string') {
            return (
              <div key={i} className="text-sm text-foreground">{h}</div>
            );
          }
          return (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{h.title}</span>
                {h.frequency && <Badge variant="positive" className="text-xs">{h.frequency}</Badge>}
              </div>
              {h.description && <p className="text-xs text-muted-foreground">{h.description}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

type RecommendationInput = Recommendation | string;

export function RecommendationsList({ items }: { items: RecommendationInput[] }) {
  if (!items?.length) return null;
  const priorityColors: Record<string, string> = {
    high: "text-red-400",
    medium: "text-amber-400",
    low: "text-muted-foreground",
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommendations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((r, i) => {
          if (typeof r === 'string') {
            return (
              <div key={i} className="text-sm text-foreground">{r}</div>
            );
          }
          return (
            <div key={i} className="flex gap-3">
              <span className={`text-xs font-semibold uppercase mt-0.5 shrink-0 ${priorityColors[r.priority] || "text-muted-foreground"}`}>
                {r.priority}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{r.action}</p>
                {r.rationale && <p className="text-xs text-muted-foreground">{r.rationale}</p>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
