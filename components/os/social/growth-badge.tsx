import React from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatPct } from "@/lib/os/departments/adapters/social-adapter";

/** Growth chip — em-dash when history is too short to compute, never a fake 0. */
export function GrowthBadge({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const Icon = value === null ? Minus : value >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-os-border px-2 py-1">
      <Icon
        className={`h-3 w-3 ${
          value === null
            ? "text-os-dim"
            : value >= 0
            ? "text-os-ok"
            : "text-os-err"
        }`}
      />
      <span
        className={`text-xs font-semibold ${
          value === null
            ? "text-os-dim"
            : value >= 0
            ? "text-os-ok"
            : "text-os-err"
        }`}
      >
        {formatPct(value)}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-os-dim">
        {label}
      </span>
    </div>
  );
}
