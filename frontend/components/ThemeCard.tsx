import { Badge } from "@/components/ui/badge";
import type { ThemeCluster } from "@/types";

export function ThemeCard({ theme }: { theme: ThemeCluster }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          {theme.label || `Theme ${theme.cluster_id + 1}`}
        </h3>
        <span className="text-xs text-gray-400 shrink-0">{theme.review_count} reviews</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {theme.keywords.map((kw) => (
          <Badge key={kw} variant="outline" className="text-xs">
            {kw}
          </Badge>
        ))}
      </div>
      {theme.avg_rating != null && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="text-yellow-500">★</span>
          <span>{theme.avg_rating.toFixed(1)} avg rating</span>
        </div>
      )}
    </div>
  );
}
