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

type SortKey = "date" | "rating" | "reviewer_name" | "sentiment";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "reviewer_name", label: "Reviewer" },
  { key: "rating", label: "Rating" },
  { key: "sentiment", label: "Sentiment" },
  { key: "date", label: "Date" },
];

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-flex flex-col text-[8px] leading-none ${active ? "text-indigo-600" : "text-gray-300"}`}>
      <span className={active && dir === "asc" ? "text-indigo-600" : "text-gray-300"}>▲</span>
      <span className={active && dir === "desc" ? "text-indigo-600" : "text-gray-300"}>▼</span>
    </span>
  );
}

export function ReviewTable({ projectId }: { projectId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sentiment, setSentiment] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const data = await getProjectReviews(projectId, {
        page,
        limit,
        sentiment: sentiment || undefined,
        rating_min: ratingFilter ?? undefined,
        rating_max: ratingFilter ?? undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      setReviews(data.reviews);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, sentiment, ratingFilter, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "rating" ? "desc" : key === "date" ? "desc" : "asc");
    }
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {["", "positive", "negative", "neutral"].map((s) => (
          <button
            key={s}
            onClick={() => {
              setSentiment(s);
              if (s && sortBy === "sentiment") { setSortBy("date"); setSortDir("desc"); }
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              sentiment === s
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {s || "All"}
          </button>
        ))}
        <span className="mx-2 text-gray-300">|</span>
        {[null, 1, 2, 3, 4, 5].map((stars) => (
          <button
            key={stars ?? "all-stars"}
            onClick={() => {
              setRatingFilter(stars);
              if (stars !== null && sortBy === "rating") { setSortBy("date"); setSortDir("desc"); }
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              ratingFilter === stars
                ? "bg-yellow-500 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {stars === null ? "All" : "★".repeat(stars)}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{total} reviews</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {!reviews?.length && !loading ? (
          <div className="p-8 text-center text-sm text-gray-400">No reviews found</div>
        ) : !reviews?.length && loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="relative">
            <div className={`transition-opacity duration-200 ${loading ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    {COLUMNS.map((col) => {
                      const disabled =
                        (col.key === "sentiment" && !!sentiment) ||
                        (col.key === "rating" && ratingFilter !== null);
                      return (
                        <th
                          key={col.key}
                          onClick={disabled ? undefined : () => handleSort(col.key)}
                          className={`px-4 py-3 select-none transition-colors ${
                            disabled
                              ? "text-gray-300"
                              : "cursor-pointer hover:text-gray-700"
                          }`}
                        >
                          <span className="inline-flex items-center">
                            {col.label}
                            {!disabled && <SortIcon active={sortBy === col.key} dir={sortDir} />}
                          </span>
                        </th>
                      );
                    })}
                    <th className="px-4 py-3 w-1/2">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reviews.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-gray-50 cursor-pointer transition-all duration-200"
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
            </div>
          </div>
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
