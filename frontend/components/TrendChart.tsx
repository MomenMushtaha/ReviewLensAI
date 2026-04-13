"use client";
import {
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "@/types";

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const rating = payload.find((p) => p.dataKey === "avg_rating")?.value;
  const count = payload.find((p) => p.dataKey === "count")?.value;
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-zinc-300 mb-1">{label}</p>
      {rating != null && (
        <p className="text-indigo-400">
          {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}{" "}
          <span className="text-zinc-200 font-medium">{rating.toFixed(2)}</span>
        </p>
      )}
      {count != null && (
        <p className="text-zinc-500">{count} review{count !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data || data.length < 2) {
    return (
      <p className="text-sm text-zinc-500 py-4 text-center">
        Not enough data to show trend
      </p>
    );
  }

  // Auto-scale Y-axis to data range with padding
  const ratings = data.map((d) => d.avg_rating);
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);
  const padding = Math.max(0.3, (maxR - minR) * 0.3);
  const yMin = Math.max(1, Math.floor((minR - padding) * 2) / 2); // snap to 0.5
  const yMax = Math.min(5, Math.ceil((maxR + padding) * 2) / 2);

  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#71717a" }}
            stroke="rgba(255,255,255,0.1)"
          />
          <YAxis
            yAxisId="rating"
            domain={[yMin, yMax]}
            tickCount={5}
            tick={{ fontSize: 11, fill: "#71717a" }}
            stroke="rgba(255,255,255,0.1)"
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <YAxis
            yAxisId="volume"
            orientation="right"
            domain={[0, maxCount * 2.5]}
            hide
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            yAxisId="volume"
            dataKey="count"
            fill="rgba(129,140,248,0.08)"
            radius={[4, 4, 0, 0]}
            barSize={24}
          />
          <Area
            yAxisId="rating"
            type="monotone"
            dataKey="avg_rating"
            stroke="none"
            fill="url(#ratingGradient)"
          />
          <Line
            yAxisId="rating"
            type="monotone"
            dataKey="avg_rating"
            stroke="#818cf8"
            strokeWidth={2.5}
            dot={{ fill: "#818cf8", r: 4, strokeWidth: 2, stroke: "#1e1e2e" }}
            activeDot={{ r: 6, fill: "#a5b4fc", stroke: "#1e1e2e", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
