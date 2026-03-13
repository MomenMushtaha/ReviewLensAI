"use client";
import { cn } from "@/lib/utils";
import { createContext, useContext, useState } from "react";

const TabsContext = createContext<{ active: string; setActive: (v: string) => void }>({
  active: "",
  setActive: () => {},
});

export function Tabs({
  defaultValue,
  children,
  className,
}: {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [active, setActive] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-1 rounded-lg bg-gray-100 p-1", className)}>{children}</div>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { active, setActive } = useContext(TabsContext);
  return (
    <button
      onClick={() => setActive(value)}
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium transition-all",
        active === value
          ? "bg-white text-gray-900 shadow-sm"
          : "text-gray-500 hover:text-gray-700",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { active } = useContext(TabsContext);
  if (active !== value) return null;
  return <div className={className}>{children}</div>;
}
