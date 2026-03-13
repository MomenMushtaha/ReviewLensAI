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
        <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
      </CardContent>
    </Card>
  );
}

export function PainPointsList({ items }: { items: PainPoint[] }) {
  if (!items?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-red-700">Pain Points</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((p, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">{p.title}</span>
              <Badge variant="neutral" className="text-xs">{p.frequency}</Badge>
            </div>
            <p className="text-xs text-gray-500">{p.description}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function HighlightsList({ items }: { items: Highlight[] }) {
  if (!items?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-emerald-700">Highlights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((h, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">{h.title}</span>
              <Badge variant="positive" className="text-xs">{h.frequency}</Badge>
            </div>
            <p className="text-xs text-gray-500">{h.description}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function RecommendationsList({ items }: { items: Recommendation[] }) {
  if (!items?.length) return null;
  const priorityColors: Record<string, string> = {
    high: "text-red-600",
    medium: "text-amber-600",
    low: "text-gray-500",
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommendations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((r, i) => (
          <div key={i} className="flex gap-3">
            <span className={`text-xs font-semibold uppercase mt-0.5 shrink-0 ${priorityColors[r.priority] || "text-gray-500"}`}>
              {r.priority}
            </span>
            <div>
              <p className="text-sm font-medium text-gray-800">{r.action}</p>
              <p className="text-xs text-gray-500">{r.rationale}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
