"use client";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS: Record<string, string> = {
  positive: "#10b981",
  negative: "#ef4444",
  neutral: "#94a3b8",
};

export function SentimentChart({ distribution }: { distribution: Record<string, number> }) {
  const data = Object.entries(distribution).map(([name, value]) => ({ name, value }));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            dataKey="value"
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={COLORS[entry.name] || "#6366f1"} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [
              `${value} (${(((value as number) / total) * 100).toFixed(0)}%)`,
              name,
            ]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
