import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearBootstrapCache } from "@/lib/bootstrap";
import { apiPatch } from "@/lib/api";
import { useAllFindings, useClients, useLocations, useControls, useControlCatalog } from "@/lib/queries";
import { STATUSES, SEVERITIES, type Finding, type FindingStatus } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import FindingDialog from "@/components/FindingDialog";
import NewFindingDialog from "@/components/NewFindingDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SortKey = "title" | "severity" | "status" | "client" | "location" | "control" | "updated_at";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<string, number> = { todo: 0, in_progress: 1, gathering_evidence: 2, done: 3 };

export default function BoardPage() {
  const { data: findings = [] } = useAllFindings();
  const { data: clients = [] } = useClients();
  const { data: locations = [] } = useLocations();
  const { data: controls = [] } = useControls();
  const { data: catalog = [] } = useControlCatalog();
  const qc = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState<string>(searchParams.get("client") ?? "all");
  const [locationFilter, setLocationFilter] = useState<string>(searchParams.get("location") ?? "all");
  const [controlFilter, setControlFilter] = useState<string>(searchParams.get("control") ?? "all");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") ?? "all");
  const [severityFilter, setSeverityFilter] = useState<string>(searchParams.get("severity") ?? "all");
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get("q") ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showDone, setShowDone] = useState<boolean>(searchParams.get("showDone") === "1");

  // Sync filters from URL when params change (e.g. navigating from dashboard)
  useEffect(() => {
    setClientFilter(searchParams.get("client") ?? "all");
    setLocationFilter(searchParams.get("location") ?? "all");
    setControlFilter(searchParams.get("control") ?? "all");
    setStatusFilter(searchParams.get("status") ?? "all");
    setSeverityFilter(searchParams.get("severity") ?? "all");
    const f = searchParams.get("finding");
    if (f) setOpenId(f);
  }, [searchParams]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  const filteredLocations = useMemo(
    () => (clientFilter === "all" ? locations : locations.filter((l) => l.client_id === clientFilter)),
    [locations, clientFilter],
  );

  const sysMap = useMemo(() => Object.fromEntries(controls.map((s) => [s.id, s])), [controls]);
  const locMap = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  function clientLabel(f: Finding) {
    const loc = locMap[f.location_id];
    return loc ? clientMap[loc.client_id]?.name ?? "—" : "—";
  }
  function locationLabel(f: Finding) {
    return locMap[f.location_id]?.name ?? "—";
  }
  function controlLabel(f: Finding) {
    const sys = sysMap[f.control_id];
    if (!sys) return "—";
    const cat = sys.catalog_id ? catalog.find((k) => k.id === sys.catalog_id) : null;
    return cat?.name ?? sys.name;
  }

  const filteredFindings = useMemo(() => {
    let result = findings;
    if (locationFilter !== "all") {
      result = result.filter((f) => f.location_id === locationFilter);
    } else if (clientFilter !== "all") {
      const locIds = new Set(locations.filter((l) => l.client_id === clientFilter).map((l) => l.id));
      result = result.filter((f) => locIds.has(f.location_id));
    }
    if (controlFilter !== "all") result = result.filter((f) => f.control_id === controlFilter);
    if (statusFilter !== "all") result = result.filter((f) => f.status === statusFilter);
    else if (!showDone) result = result.filter((f) => f.status !== "done");
    if (severityFilter !== "all") result = result.filter((f) => f.severity === severityFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((f) =>
        f.title.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [findings, locations, clientFilter, locationFilter, controlFilter, statusFilter, severityFilter, showDone, searchQuery]);

  const sortedFindings = useMemo(() => {
    const arr = [...filteredFindings];
    arr.sort((a, b) => {
      let av: number | string = "";
      let bv: number | string = "";
      switch (sortKey) {
        case "severity":
          av = SEVERITY_ORDER[a.severity] ?? 99;
          bv = SEVERITY_ORDER[b.severity] ?? 99;
          break;
        case "status":
          av = STATUS_ORDER[a.status] ?? 99;
          bv = STATUS_ORDER[b.status] ?? 99;
          break;
        case "client":
          av = clientLabel(a).toLowerCase();
          bv = clientLabel(b).toLowerCase();
          break;
        case "location":
          av = locationLabel(a).toLowerCase();
          bv = locationLabel(b).toLowerCase();
          break;
        case "control":
          av = controlLabel(a).toLowerCase();
          bv = controlLabel(b).toLowerCase();
          break;
        case "updated_at":
          av = a.updated_at ?? "";
          bv = b.updated_at ?? "";
          break;
        default:
          av = a.title.toLowerCase();
          bv = b.title.toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredFindings, sortKey, sortDir, sysMap, locMap, clientMap]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FindingStatus }) => {
      await apiPatch(`findings/${id}`, { status });
    },
    onSuccess: () => {
      clearBootstrapCache();
      qc.invalidateQueries({ queryKey: ["findings"] });
    },
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function statusLabel(s: FindingStatus) {
    return STATUSES.find((x) => x.value === s)?.label ?? s;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Findings</h1>
          <p className="mt-1 text-sm text-muted-foreground">All findings across clients and locations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                const v = e.target.value;
                setSearchQuery(v);
                const next = new URLSearchParams(searchParams);
                if (v) next.set("q", v); else next.delete("q");
                setSearchParams(next, { replace: true });
              }}
              placeholder="Search findings…"
              className="h-9 w-[200px] pl-8 text-sm"
            />
          </div>
          <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setLocationFilter("all"); updateParam("client", v); updateParam("location", "all"); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={(v) => { setLocationFilter(v); updateParam("location", v); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All sites" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {filteredLocations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={controlFilter} onValueChange={(v) => { setControlFilter(v); updateParam("control", v); }}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All controls" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All controls</SelectItem>
              {controls
                .map((c) => {
                  const cat = c.catalog_id ? catalog.find((k) => k.id === c.catalog_id) : null;
                  const code = cat?.code ?? null;
                  const name = cat?.name ?? c.name;
                  const label = code ? `${code} · ${name}` : name;
                  return { id: c.id, label, code: code ?? "", name };
                })
                .sort((a, b) => (a.code || "zzz").localeCompare(b.code || "zzz") || a.name.localeCompare(b.name))
                .map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); updateParam("status", v); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); updateParam("severity", v); }}>
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
          <Button onClick={() => setNewOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New finding
          </Button>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card/40">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Title" active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")} />
              <SortableHead label="Severity" active={sortKey === "severity"} dir={sortDir} onClick={() => toggleSort("severity")} className="w-[110px]" />
              <SortableHead label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} className="w-[130px]" />
              <SortableHead label="Client" active={sortKey === "client"} dir={sortDir} onClick={() => toggleSort("client")} className="w-[140px]" />
              <SortableHead label="Location" active={sortKey === "location"} dir={sortDir} onClick={() => toggleSort("location")} className="w-[140px]" />
              <SortableHead label="Control" active={sortKey === "control"} dir={sortDir} onClick={() => toggleSort("control")} className="w-[180px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedFindings.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                  No findings match these filters.
                </TableCell>
              </TableRow>
            )}
            {sortedFindings.map((f) => (
              <TableRow
                key={f.id}
                className="cursor-pointer"
                onClick={() => setOpenId(f.id)}
              >
                <TableCell className="font-medium">
                  <div className="leading-snug">{f.title}</div>
                  {f.description && (
                    <div className="line-clamp-1 text-xs text-muted-foreground">{f.description}</div>
                  )}
                </TableCell>
                <TableCell><SeverityBadge severity={f.severity} /></TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className={`h-2 w-2 rounded-full ${dotColor(f.status)}`} />
                    {statusLabel(f.status)}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{clientLabel(f)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{locationLabel(f)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{controlLabel(f)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <FindingDialog id={openId} onOpenChange={(o) => !o && setOpenId(null)} />
      <NewFindingDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
  className,
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
