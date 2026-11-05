import { cn } from "@/lib/utils";
import type { FindingSeverity } from "@/lib/types";

const styles: Record<FindingSeverity, string> = {
  low: "bg-severity-low/10 text-severity-low ring-severity-low/20",
  medium: "bg-severity-medium/10 text-severity-medium ring-severity-medium/20",
  high: "bg-severity-high/10 text-severity-high ring-severity-high/20",
  critical: "bg-severity-critical/10 text-severity-critical ring-severity-critical/20",
};

export function SeverityBadge({ severity, className }: { severity: FindingSeverity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        styles[severity],
        className,
      )}
    >
      {severity}
    </span>
  );
}
