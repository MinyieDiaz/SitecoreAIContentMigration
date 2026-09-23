"use client";

import type { ReactNode } from "react";
import { Icon } from "@/lib/icon";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Tailwind's JIT scanner needs static class names, so a dynamic column count
// is looked up rather than interpolated into a `grid-cols-${n}` string.
const GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

interface CardTabsListProps {
  columns: number;
  children: ReactNode;
  className?: string;
}

// The "pick one of N modes" grid-of-cards pattern established by
// PackagesWorkspace, extracted so any other mode switch that deserves the
// same deliberate-choice treatment (e.g. Install's auth-mode switch) can
// reuse it instead of copy-pasting the token string.
export function CardTabsList({ columns, children, className }: CardTabsListProps) {
  return (
    <TabsList
      variant="soft-rounded"
      className={cn("grid h-auto w-full gap-3 bg-transparent p-0", GRID_COLS[columns] ?? GRID_COLS[2], className)}
    >
      {children}
    </TabsList>
  );
}

interface CardTabsTriggerProps {
  value: string;
  icon: string;
  title: string;
  description: string;
}

export function CardTabsTrigger({ value, icon, title, description }: CardTabsTriggerProps) {
  return (
    <TabsTrigger
      value={value}
      variant="soft-rounded"
      className="group h-full self-stretch items-center justify-start gap-3 rounded-lg border border-border-color px-4 py-3 text-left hover:bg-neutral-bg data-[state=active]:border-primary-fg data-[state=active]:bg-primary-bg"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-bg text-neutral-fg group-data-[state=active]:bg-primary group-data-[state=active]:text-inverse-text">
        <Icon path={icon} size={0.85} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-md font-semibold text-neutral-fg group-data-[state=active]:text-primary-fg">
          {title}
        </span>
        <span className="text-sm font-normal whitespace-normal text-muted-foreground">{description}</span>
      </span>
    </TabsTrigger>
  );
}
