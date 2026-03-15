"use client";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS: Record<string, string> = {
  positive: "#34d399",
  negative: "#f87171",
  neutral: "#71717a",
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
            stroke="rgba(17,17,24,0.8)"
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={COLORS[entry.name] || "#818cf8"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(17,17,24,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#e4e4e7",
              fontSize: "12px",
            }}
            formatter={(value, name) => [
              `${value} (${(((value as number) / total) * 100).toFixed(0)}%)`,
              name,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", color: "#71717a" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
