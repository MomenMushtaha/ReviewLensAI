"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "@/types";

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data || data.length < 2) {
    return (
      <p className="text-sm text-zinc-500 py-4 text-center">
        Not enough data to show trend
      </p>
    );
  }
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#71717a" }} stroke="rgba(255,255,255,0.1)" />
          <YAxis domain={[1, 5]} tickCount={5} tick={{ fontSize: 11, fill: "#71717a" }} stroke="rgba(255,255,255,0.1)" />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(17,17,24,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#e4e4e7",
              fontSize: "12px",
            }}
            formatter={(value) => [(value as number).toFixed(2), "Avg Rating"]}
          />
          <Line
            type="monotone"
            dataKey="avg_rating"
            stroke="#818cf8"
            strokeWidth={2}
            dot={{ fill: "#818cf8", r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
