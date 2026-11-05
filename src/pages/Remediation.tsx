import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAllFindings, useClients, useLocations, useControls, useControlCatalog } from "@/lib/queries";
import {
  STATUSES,
  SEVERITIES,
  type Finding,
  type FindingSeverity,
  type FindingStatus,
  type RemediationPlan,
} from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityBadge } from "@/components/SeverityBadge";
import RemediationPlanDialog from "@/components/RemediationPlanDialog";
import { Plus, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { getBootstrapData, clearBootstrapCache } from "@/lib/bootstrap";
import { apiPost } from "@/lib/api";

type SortKey =
  | "code"
  | "title"
  | "severity"
  | "status"
  | "client"
  | "location"
  | "control"
  | "findings"
  | "effort";

const SEVERITY_ORDER: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<FindingStatus, number> = { todo: 0, in_progress: 1, gathering_evidence: 2, done: 3 };

export default function RemediationPage() {
  const qc = useQueryClient();
  const { data: findings = [] } = useAllFindings();
  const { data: clients = [] } = useClients();
  const { data: locations = [] } = useLocations();
  const { data: controls = [] } = useControls();
  const { data: catalog = [] } = useControlCatalog();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showDone, setShowDone] = useState<boolean>(searchParams.get("showDone") === "1");

  useEffect(() => {
    const p = searchParams.get("plan");
    if (p) setOpenId(p);
  }, [searchParams]);

  const { data: plans = [] } = useQuery({
    queryKey: ["remediation_plans"],
    queryFn: async (): Promise<RemediationPlan[]> => {
      const data = await getBootstrapData();
      return data.remediation_plans as RemediationPlan[];
    },
  });

  const { data: planFindings = {} } = useQuery({
    queryKey: ["plan-findings-all"],
    queryFn: async () => {
      const data = await getBootstrapData();
      const m: Record<string, string[]> = {};

      for (const r of data.remediation_plan_findings as { plan_id: string; finding_id: string }[]) {
        (m[r.plan_id] ||= []).push(r.finding_id);
      }

      return m;
    },
  });

  const findingMap = useMemo(() => Object.fromEntries(findings.map((f) => [f.id, f])), [findings]);
  const ctrlMap = useMemo(() => Object.fromEntries(controls.map((c) => [c.id, c])), [controls]);
  const locMap = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  function controlLabelOf(f: Finding) {
    const sys = ctrlMap[f.control_id];
    if (!sys) return "—";
    const cat = sys.catalog_id ? catalog.find((k) => k.id === sys.catalog_id) : null;
    return cat?.name ?? sys.name;
  }

  type Row = {
    p: RemediationPlan;
    fids: string[];
    linked: Finding[];
    severity: FindingSeverity | null;
    client: string;
    location: string;
    control: string;
  };

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans
      .map<Row>((p) => {
        const fids = planFindings[p.id] ?? [];
        const linked = fids.map((id) => findingMap[id]).filter(Boolean) as Finding[];

        let severity: FindingSeverity | null = null;
        if (linked.length) {
          severity = linked.reduce<FindingSeverity>((best, f) =>
            SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[best] ? f.severity : best,
            linked[0].severity);
        }

        const clientNames = Array.from(new Set(linked.map((f) => {
          const loc = locMap[f.location_id];
          return loc ? clientMap[loc.client_id]?.name : null;
        }).filter(Boolean) as string[]));
        const locNames = Array.from(new Set(linked.map((f) => locMap[f.location_id]?.name).filter(Boolean) as string[]));
        const ctrlNames = Array.from(new Set(linked.map((f) => controlLabelOf(f)).filter((s) => s && s !== "—")));

        const fmt = (arr: string[]) =>
          arr.length === 0 ? "—" : arr.length === 1 ? arr[0] : `${arr[0]} +${arr.length - 1}`;

        return {
          p, fids, linked, severity,
          client: fmt(clientNames),
          location: fmt(locNames),
          control: fmt(ctrlNames),
        };
      })
      .filter((r) => {
        if (statusFilter !== "all" && r.p.status !== statusFilter) return false;
        else if (statusFilter === "all" && !showDone && r.p.status === "done") return false;
        if (severityFilter !== "all" && r.severity !== severityFilter) return false;
        if (q) {
          const hay = `${r.p.code ?? ""} ${r.p.title} ${r.p.description ?? ""} ${r.linked.map((f) => f.title).join(" ")}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [plans, planFindings, findingMap, locMap, clientMap, ctrlMap, catalog, statusFilter, severityFilter, search, showDone]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "code": av = a.p.code ?? "zzz"; bv = b.p.code ?? "zzz"; break;
        case "title": av = a.p.title.toLowerCase(); bv = b.p.title.toLowerCase(); break;
        case "severity":
          av = a.severity ? SEVERITY_ORDER[a.severity] : 99;
          bv = b.severity ? SEVERITY_ORDER[b.severity] : 99;
          break;
        case "status": av = STATUS_ORDER[a.p.status]; bv = STATUS_ORDER[b.p.status]; break;
        case "client": av = a.client.toLowerCase(); bv = b.client.toLowerCase(); break;
        case "location": av = a.location.toLowerCase(); bv = b.location.toLowerCase(); break;
        case "control": av = a.control.toLowerCase(); bv = b.control.toLowerCase(); break;
        case "findings": av = a.fids.length; bv = b.fids.length; break;
	case "effort": av = Number(a.p.effort_days ?? -1); bv = Number(b.p.effort_days ?? -1); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const create = useMutation({
    mutationFn: async () => {
      const bootstrapData = await getBootstrapData();
      const existing = bootstrapData.remediation_plans as { code: string | null }[];
      const max = existing.reduce((acc, r) => {
        const m = r.code?.match(/^RP-(\d+)$/);
        const n = m ? parseInt(m[1], 10) : 0;
        return n > acc ? n : acc;
      }, 0);
      const nextCode = `RP-${String(max + 1).padStart(3, "0")}`;
      const res = await apiPost("remediation-plans", { code: nextCode, title: "Untitled plan" });
      return res.data as RemediationPlan;
    },
    onSuccess: (p) => {
      clearBootstrapCache();
      qc.invalidateQueries({ queryKey: ["remediation_plans"] });
      setOpenId(p.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

const totalEffort = sortedRows.reduce((s, r) => s + Number(r.p.effort_days ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Remediation plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plans are independent of findings. Link a plan to one or more findings to track shared remediation work.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All severities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
            <Checkbox
              checked={showDone}
              onCheckedChange={(v) => {
                const next = !!v;
                setShowDone(next);
                const p = new URLSearchParams(searchParams);
                if (next) p.set("showDone", "1"); else p.delete("showDone");
                setSearchParams(p, { replace: true });
              }}
            />
            Show done
          </Label>
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" /> New plan
          </Button>
        </div>
      </header>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, title, description, linked finding..."
            className="pl-8"
          />
        </div>
      </Card>

      <div className="rounded-2xl border border-border bg-card/40">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>{sortedRows.length} of {plans.length} plans</span>
          <span>Total effort: <span className="font-medium text-foreground">{totalEffort} days</span></span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Code" active={sortKey === "code"} dir={sortDir} onClick={() => toggleSort("code")} className="w-[110px]" />
              <SortableHead label="Title" active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")} />
              <SortableHead label="Severity" active={sortKey === "severity"} dir={sortDir} onClick={() => toggleSort("severity")} className="w-[110px]" />
              <SortableHead label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} className="w-[130px]" />
              <SortableHead label="Client" active={sortKey === "client"} dir={sortDir} onClick={() => toggleSort("client")} className="w-[140px]" />
              <SortableHead label="Location" active={sortKey === "location"} dir={sortDir} onClick={() => toggleSort("location")} className="w-[140px]" />
              <SortableHead label="Control" active={sortKey === "control"} dir={sortDir} onClick={() => toggleSort("control")} className="w-[180px]" />
              <SortableHead label="Effort" active={sortKey === "effort"} dir={sortDir} onClick={() => toggleSort("effort")} className="w-[90px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                  {plans.length === 0 ? "No remediation plans yet. Create one to get started." : "No plans match these filters."}
                </TableCell>
              </TableRow>
            )}
            {sortedRows.map((r) => (
              <TableRow key={r.p.id} className="cursor-pointer" onClick={() => setOpenId(r.p.id)}>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.p.code ?? "—"}</TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5 leading-snug">
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                    {r.p.title}
                  </div>
                  {r.p.description && (
                    <div className="line-clamp-1 text-xs text-muted-foreground">{r.p.description}</div>
                  )}
                </TableCell>
                <TableCell>
                  {r.severity ? <SeverityBadge severity={r.severity} /> : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className={`h-2 w-2 rounded-full ${dotColor(r.p.status)}`} />
                    {STATUSES.find((s) => s.value === r.p.status)?.label}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.client}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.location}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.control}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {r.p.effort_days != null ? `${r.p.effort_days} d` : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RemediationPlanDialog
        id={openId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            if (searchParams.get("plan")) {
              const next = new URLSearchParams(searchParams);
              next.delete("plan");
              setSearchParams(next, { replace: true });
            }
          }
        }}
      />
    </div>
  );
}

function SortableHead({
  label, active, dir, onClick, className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {label}
        {active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </TableHead>
  );
}

function dotColor(s: FindingStatus) {
  return s === "todo" ? "bg-muted-foreground" : s === "in_progress" ? "bg-primary" : s === "gathering_evidence" ? "bg-warning" : "bg-success";
}
