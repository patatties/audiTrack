import { useMemo, useState } from "react";
import { useClients, useLocations } from "@/lib/queries";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { generateScopedReport } from "@/lib/scoped-report";

type Target = { kind: "client"; clientId: string } | { kind: "site"; clientId: string; locationId: string };

export default function ScopedReportDialog() {
  const { data: clients = [] } = useClients();
  const { data: locations = [] } = useLocations();
  const [open, setOpen] = useState(false);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);

  const locsByClient = useMemo(() => {
    const m = new Map<string, typeof locations>();
    for (const l of locations) {
      const arr = m.get(l.client_id) ?? [];
      arr.push(l);
      m.set(l.client_id, arr);
    }
    return m;
  }, [locations]);

  const targets: Target[] = useMemo(() => {
    const out: Target[] = [];
    for (const cid of selectedClients) out.push({ kind: "client", clientId: cid });
    for (const lid of selectedLocations) {
      const loc = locations.find((l) => l.id === lid);
      if (loc) out.push({ kind: "site", clientId: loc.client_id, locationId: lid });
    }
    return out;
  }, [selectedClients, selectedLocations, locations]);

  const toggleClient = (id: string) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleLocation = (id: string) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllClients = () => setSelectedClients(new Set(clients.map((c) => c.id)));
  const selectAllSites = () => setSelectedLocations(new Set(locations.map((l) => l.id)));
  const clearAll = () => { setSelectedClients(new Set()); setSelectedLocations(new Set()); };

  const onExport = async () => {
    if (targets.length === 0) {
      toast.error("Select at least one client or site");
      return;
    }
    setBusy(true);
    let ok = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const label =
          t.kind === "client"
            ? clients.find((c) => c.id === t.clientId)?.name ?? "Client"
            : `${clients.find((c) => c.id === t.clientId)?.name ?? ""} — ${locations.find((l) => l.id === t.locationId)?.name ?? ""}`;
        setProgress({ current: i + 1, total: targets.length, label });
        toast.message(`Generating ${i + 1}/${targets.length}: ${label}`);
        try {
          await generateScopedReport({
            clientId: t.kind === "client" ? t.clientId : null,
            locationId: t.kind === "site" ? t.locationId : null,
          });
          ok++;
        } catch (e) {
          toast.error(`Failed: ${label} — ${(e as Error).message}`);
        }
      }
      toast.success(`Generated ${ok}/${targets.length} report(s)`);
      if (ok === targets.length) setOpen(false);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileText className="h-4 w-4" /> Export site / client report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>In-depth remediation report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Select one or more clients and/or sites. A separate PDF report will be generated and
            downloaded sequentially for each selection.
          </p>

          <div className="flex flex-wrap gap-2 text-xs">
            <Button size="sm" variant="secondary" onClick={selectAllClients} disabled={busy}>All clients</Button>
            <Button size="sm" variant="secondary" onClick={selectAllSites} disabled={busy}>All sites</Button>
            <Button size="sm" variant="ghost" onClick={clearAll} disabled={busy}>Clear</Button>
            <span className="ml-auto self-center text-muted-foreground">
              {targets.length} report{targets.length === 1 ? "" : "s"} queued
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-border p-2">
            {clients.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No clients yet.</p>
            ) : (
              clients.map((c) => {
                const locs = locsByClient.get(c.id) ?? [];
                const clientChecked = selectedClients.has(c.id);
                return (
                  <div key={c.id} className="mb-1">
                    <button
                      type="button"
                      onClick={() => toggleClient(c.id)}
                      disabled={busy}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary"
                    >
                      <Checkbox checked={clientChecked} />
                      <span className="text-xs font-semibold uppercase tracking-wide">{c.name}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground">(whole client)</span>
                    </button>
                    <div className="ml-5 space-y-0.5">
                      {locs.length === 0 ? (
                        <div className="px-2 py-1 text-xs text-muted-foreground">No sites</div>
                      ) : (
                        locs.map((l) => {
                          const checked = selectedLocations.has(l.id);
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => toggleLocation(l.id)}
                              disabled={busy}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary"
                            >
                              <Checkbox checked={checked} />
                              <span>{l.name}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {progress && (
            <div className="rounded-md bg-secondary px-3 py-2 text-xs">
              Generating {progress.current}/{progress.total}: <span className="font-medium">{progress.label}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={onExport} disabled={busy || targets.length === 0} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate {targets.length > 0 ? `${targets.length} PDF${targets.length === 1 ? "" : "s"}` : "PDF"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
