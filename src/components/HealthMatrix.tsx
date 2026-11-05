import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import ControlOverviewDialog from "@/components/ControlOverviewDialog";
import {
  useAllFindings,
  useClients,
  useLocations,
  useControls,
  useControlCatalog,
  useAllControlLocations,
} from "@/lib/queries";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Health = "na" | "healthy" | "warn" | "critical";

function cellTone(h: Health) {
  switch (h) {
    case "healthy":
      return "bg-success/15 text-success";
    case "warn":
      return "bg-warning/20 text-warning-foreground";
    case "critical":
      return "bg-destructive/20 text-destructive";
    default:
      return "bg-muted/40 text-muted-foreground";
  }
}

export default function HealthMatrix() {
  const { data: findings = [] } = useAllFindings();
  const { data: clients = [] } = useClients();
  const { data: locations = [] } = useLocations();
  const { data: controls = [] } = useControls();
  const { data: catalog = [] } = useControlCatalog();
  const { data: links = [] } = useAllControlLocations();
  const [openControlId, setOpenControlId] = useState<string | null>(null);

  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  // Group locations by client for column headers
  const columnGroups = useMemo(() => {
    return clients
      .map((c) => ({
        client: c,
        sites: locations.filter((l) => l.client_id === c.id),
      }))
      .filter((g) => g.sites.length > 0);
  }, [clients, locations]);

  const flatSites = useMemo(() => columnGroups.flatMap((g) => g.sites), [columnGroups]);

  // For each control, set of applicable location ids
  const controlSites = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of controls) {
      const set = new Set<string>();
      if (c.applies_to_all) {
        for (const l of locations) set.add(l.id);
      } else {
        for (const link of links) if (link.control_id === c.id) set.add(link.location_id);
      }
      map.set(c.id, set);
    }
    return map;
  }, [controls, links, locations]);

  // Filter rows: only controls applicable somewhere
  const rows = useMemo(() => {
    return controls
      .filter((c) => (controlSites.get(c.id)?.size ?? 0) > 0)
      .sort((a, b) => {
        const ac = a.catalog_id ? catalogById.get(a.catalog_id)?.code ?? "" : "";
        const bc = b.catalog_id ? catalogById.get(b.catalog_id)?.code ?? "" : "";
        return (ac || a.name).localeCompare(bc || b.name, undefined, { numeric: true });
      });
  }, [controls, controlSites, catalogById]);

  function healthFor(controlId: string, locationId: string): {
    h: Health;
    open: number;
    done: number;
    total: number;
  } {
    const sites = controlSites.get(controlId);
    if (!sites || !sites.has(locationId)) return { h: "na", open: 0, done: 0, total: 0 };
    const cf = findings.filter((f) => f.control_id === controlId && f.location_id === locationId);
    if (cf.length === 0) return { h: "healthy", open: 0, done: 0, total: 0 };
    const open = cf.filter((f) => f.status !== "done");
    const done = cf.length - open.length;
    if (open.length === 0) return { h: "healthy", open: 0, done, total: cf.length };
    const hasSevere = open.some((f) => f.severity === "critical" || f.severity === "high");
    return { h: hasSevere ? "critical" : "warn", open: open.length, done, total: cf.length };
  }

  if (rows.length === 0 || flatSites.length === 0) {
    return (
      <Card className="p-6 shadow-soft">
        <h2 className="mb-2 text-lg font-semibold">Control health by site</h2>
        <p className="text-sm text-muted-foreground">
          No applicable controls and sites yet.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Control health by site</h2>
          <p className="text-sm text-muted-foreground">
            Each cell rolls up findings for that control at that site.
          </p>
        </div>
        <div className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
          <LegendDot tone="healthy" label="Healthy" />
          <LegendDot tone="warn" label="Open (low/med)" />
          <LegendDot tone="critical" label="Open (high/critical)" />
          <LegendDot tone="na" label="N/A" />
        </div>
      </div>

      <div>
        <TooltipProvider delayDuration={150}>
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              <col style={{ width: "22%" }} />
              {flatSites.map((s) => (
                <col key={s.id} style={{ width: `${78 / flatSites.length}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card p-2 text-left align-bottom font-medium text-muted-foreground" />
                {columnGroups.map((g) => (
                  <th
                    key={g.client.id}
                    colSpan={g.sites.length}
                    className="border-b border-border px-2 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {g.client.name}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-card p-2 text-left font-medium">
                  Control
                </th>
                {flatSites.map((s) => (
                  <th
                    key={s.id}
                    className="border-b border-border p-2 text-left font-medium"
                    title={s.name}
                  >
                    <div className="truncate">{s.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const cat = c.catalog_id ? catalogById.get(c.catalog_id) : null;
                const code = cat?.code ?? "";
                const label = cat?.name ?? c.name;
                return (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="sticky left-0 z-10 max-w-[320px] bg-card p-2 align-middle">
                      <button
                        onClick={() => setOpenControlId(c.id)}
                        className="flex w-full items-baseline gap-2 whitespace-nowrap text-left hover:text-primary"
                      >
                        {code && (
                          <span className="font-mono text-xs text-muted-foreground">{code}</span>
                        )}
                        <span className="truncate font-medium underline-offset-2 hover:underline" title={label}>{label}</span>
                      </button>
                    </td>
                    {flatSites.map((s) => {
                      const { h, open, done, total } = healthFor(c.id, s.id);
                      const linkable = h !== "na" && total > 0;
                      const cellInner = (
                        <div
                          className={cn(
                            "mx-auto flex h-9 min-w-[36px] items-center justify-center rounded-md px-2 text-xs font-medium",
                            cellTone(h),
                            linkable && "cursor-pointer transition-opacity hover:opacity-80",
                          )}
                        >
                          {h === "na" ? "—" : total === 0 ? "✓" : `${open}/${total}`}
                        </div>
                      );
                      return (
                        <td key={s.id} className="p-1 align-middle">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {linkable ? (
                                <Link
                                  to={`/board?control=${c.id}&client=${s.client_id}&location=${s.id}`}
                                  aria-label={`Findings for ${label} at ${s.name}`}
                                >
                                  {cellInner}
                                </Link>
                              ) : (
                                cellInner
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <div className="font-medium">{label}</div>
                                <div className="text-muted-foreground">{s.name}</div>
                                {h === "na" ? (
                                  <div>Not applicable</div>
                                ) : total === 0 ? (
                                  <div>No findings</div>
                                ) : (
                                  <div>
                                    {open} open · {done} resolved · click to view
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TooltipProvider>
      </div>
      <ControlOverviewDialog
        controlId={openControlId}
        onOpenChange={(o) => { if (!o) setOpenControlId(null); }}
      />
    </Card>
  );
}

function LegendDot({ tone, label }: { tone: Health; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-3 rounded", cellTone(tone))} />
      {label}
    </span>
  );
}
