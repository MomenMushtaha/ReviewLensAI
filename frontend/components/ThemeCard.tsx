import { Badge } from "@/components/ui/badge";
import type { ThemeCluster } from "@/types";

const SENTIMENT_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  positive: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Positive" },
  negative: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Negative" },
  neutral: { bg: "bg-gray-50", text: "text-gray-600", dot: "bg-gray-400", label: "Neutral" },
  mixed: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Mixed" },
};

export function ThemeCard({
  theme,
  maxReviews,
}: {
  theme: ThemeCluster;
  maxReviews?: number;
}) {
  const sentiment = SENTIMENT_CONFIG[theme.sentiment] ?? SENTIMENT_CONFIG.neutral;
  const barWidth = maxReviews ? Math.round((theme.review_count / maxReviews) * 100) : 0;

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-5 space-y-4 hover:border-indigo-200 hover:shadow-md transition-all duration-200">
      {/* Header: label + sentiment badge */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900 leading-snug">
          {theme.label || `Theme ${theme.index + 1}`}
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${sentiment.bg} ${sentiment.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${sentiment.dot}`} />
          {sentiment.label}
        </span>
      </div>

      {/* Keywords */}
      <div className="flex flex-wrap gap-1.5">
        {theme.keywords.map((kw) => (
          <Badge
            key={kw}
            variant="outline"
            className="text-xs bg-gray-50 text-gray-600 border-gray-200"
          >
            {kw}
          </Badge>
        ))}
      </div>

      {/* Stats row: review count bar + avg rating */}
      <div className="space-y-2 pt-1">
        {/* Review count bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-400 rounded-full transition-all duration-500"
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500 tabular-nums shrink-0">
            {theme.review_count} reviews
          </span>
        </div>

        {/* Avg rating */}
        {theme.avg_rating != null && (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={`text-xs ${
                    star <= Math.round(theme.avg_rating!)
                      ? "text-yellow-400"
                      : "text-gray-200"
                  }`}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="text-xs text-gray-500 tabular-nums">
              {theme.avg_rating.toFixed(1)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
