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
      <p className="text-sm text-gray-400 py-4 text-center">
        Not enough data to show trend
      </p>
    );
  }
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis domain={[1, 5]} tickCount={5} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => [(value as number).toFixed(2), "Avg Rating"]} />
          <Line
            type="monotone"
            dataKey="avg_rating"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ fill: "#6366f1", r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
