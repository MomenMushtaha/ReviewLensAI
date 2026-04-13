"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { BiasAnalysis } from "@/types";

const LEVEL_STYLES: Record<string, string> = {
  high: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  moderate: "bg-yellow-500/15 text-yellow-300 border-yellow-500/20",
  low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  minimal: "bg-white/5 text-zinc-400 border-white/10",
};

const STRENGTH_STYLES: Record<string, string> = {
  high: "bg-amber-500/15 text-amber-300",
  medium: "bg-yellow-500/15 text-yellow-300",
  low: "bg-zinc-500/15 text-zinc-400",
};

function Stars({ rating, max = 5 }: { rating: number; max?: number }) {
  const full = Math.round(rating);
  return (
    <span className="text-amber-400 tracking-wide">
      {"★".repeat(Math.min(full, max))}
      {"☆".repeat(Math.max(0, max - full))}
    </span>
  );
}

export function BiasInsights({ biasAnalysis }: { biasAnalysis: BiasAnalysis }) {
  const [showAll, setShowAll] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const detected = biasAnalysis.signals.filter((s) => s.detected);
  const notDetected = biasAnalysis.signals.filter((s) => !s.detected);
  const levelStyle = LEVEL_STYLES[biasAnalysis.overall_bias_level] || LEVEL_STYLES.minimal;
  const hasRatings = biasAnalysis.raw_rating != null && biasAnalysis.adjusted_rating != null;
  const hasAdjustment = hasRatings && biasAnalysis.rating_adjustment > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>Review Bias Intelligence</CardTitle>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${levelStyle}`}>
              {biasAnalysis.overall_bias_level}
            </span>
          </div>
          <span className="text-xs text-zinc-600">
            {detected.length}/{biasAnalysis.signals.length} signals detected
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Adjusted Rating Hero */}
        {hasRatings && <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between gap-8">
            {/* Raw */}
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Raw Rating</p>
              <p className="text-2xl font-bold text-zinc-400">{biasAnalysis.raw_rating.toFixed(1)}</p>
              <Stars rating={biasAnalysis.raw_rating} />
            </div>

            {/* Arrow */}
            {hasAdjustment && (
              <div className="flex flex-col items-center gap-1">
                <svg width="40" height="16" viewBox="0 0 40 16" className="text-indigo-400">
                  <path d="M0 8 H32 M28 3 L34 8 L28 13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[10px] font-medium text-emerald-400">+{biasAnalysis.rating_adjustment.toFixed(1)}</span>
              </div>
            )}

            {/* Adjusted */}
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
                {hasAdjustment ? "Adjusted Rating" : "Rating"}
              </p>
              <p className={`text-2xl font-bold ${hasAdjustment ? "text-indigo-300" : "text-zinc-400"}`}>
                {biasAnalysis.adjusted_rating.toFixed(1)}
              </p>
              <Stars rating={biasAnalysis.adjusted_rating} />
              {hasAdjustment && biasAnalysis.confidence_low != null && (
                <p className="text-[10px] text-zinc-600 mt-1">
                  range: {biasAnalysis.confidence_low.toFixed(1)} – {biasAnalysis.confidence_high.toFixed(1)}
                </p>
              )}
            </div>
          </div>

          {/* Adjustment breakdown */}
          {hasAdjustment && biasAnalysis.adjustment_reasons.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="text-[11px] text-indigo-400/70 hover:text-indigo-400 transition-colors"
              >
                {showBreakdown ? "Hide" : "Show"} adjustment breakdown
              </button>
              {showBreakdown && (
                <div className="mt-2 space-y-2">
                  {biasAnalysis.adjustment_reasons.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-emerald-400 text-xs font-mono shrink-0">+{r.adjustment.toFixed(1)}</span>
                      <div>
                        <span className="text-xs text-zinc-300">{r.label}</span>
                        <p className="text-[11px] text-zinc-600">{r.explanation}</p>
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-zinc-700 italic mt-1">
                    Adjustment capped at +2.5 stars maximum.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>}

        <p className="text-sm text-zinc-400 leading-relaxed">{biasAnalysis.summary}</p>

        {detected.length > 0 && (
          <div className="space-y-3">
            {detected.map((s) => (
              <div key={s.bias_type} className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">{s.label}</span>
                  {s.strength && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STRENGTH_STYLES[s.strength] || ""}`}>
                      {s.strength}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">{s.evidence}</p>
                <p className="text-xs text-zinc-600 italic">{s.adjustment_note}</p>
              </div>
            ))}
          </div>
        )}

        {notDetected.length > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showAll ? "Hide" : "Show"} {notDetected.length} undetected signal{notDetected.length > 1 ? "s" : ""}
          </button>
        )}

        {showAll && notDetected.length > 0 && (
          <div className="space-y-2 opacity-50">
            {notDetected.map((s) => (
              <div key={s.bias_type} className="flex items-center gap-2 px-4 py-2">
                <span className="text-xs text-zinc-500">{s.label}</span>
                <span className="text-[10px] text-zinc-700">not detected</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
