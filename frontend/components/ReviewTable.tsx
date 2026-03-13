"use client";
import { useEffect, useState } from "react";
import { getProjectReviews } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { Review } from "@/types";

const SENTIMENT_VARIANTS: Record<string, "positive" | "negative" | "neutral"> = {
  positive: "positive",
  negative: "negative",
  neutral: "neutral",
};

export function ReviewTable({ projectId }: { projectId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sentiment, setSentiment] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const data = await getProjectReviews(projectId, {
        offset: (page - 1) * limit,
        limit,
        sentiment: sentiment || undefined,
      });
      setReviews(data.reviews);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, sentiment]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {["", "positive", "negative", "neutral"].map((s) => (
          <button
            key={s}
            onClick={() => { setSentiment(s); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              sentiment === s
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {s || "All"}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{total} reviews</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No reviews found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Reviewer</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Sentiment</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 w-1/2">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reviews.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                    {r.reviewer_name || "Anonymous"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.rating ? (
                      <span className="text-yellow-500">{"★".repeat(Math.round(r.rating))}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.sentiment && (
                      <Badge variant={SENTIMENT_VARIANTS[r.sentiment] || "neutral"}>
                        {r.sentiment}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className={expanded === r.id ? "" : "line-clamp-2"}>{r.body}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
