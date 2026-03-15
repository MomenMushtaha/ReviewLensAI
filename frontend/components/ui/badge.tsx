import { cn } from "@/lib/utils";

const variants = {
  default: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20",
  positive: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
  negative: "bg-red-500/15 text-red-300 border border-red-500/20",
  neutral: "bg-white/5 text-zinc-400 border border-white/10",
  outline: "border border-white/10 text-zinc-400",
};

interface BadgeProps {
  className?: string;
  variant?: keyof typeof variants;
  children: React.ReactNode;
}

export function Badge({ className, variant = "default", children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
