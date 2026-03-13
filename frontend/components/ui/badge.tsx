import { cn } from "@/lib/utils";

const variants = {
  default: "bg-indigo-100 text-indigo-700",
  positive: "bg-emerald-100 text-emerald-700",
  negative: "bg-red-100 text-red-700",
  neutral: "bg-gray-100 text-gray-600",
  outline: "border border-gray-200 text-gray-600 bg-white",
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
