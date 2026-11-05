import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useControlCatalog, useAllFindings, useLocations, useControls, useAllControlLocations } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Library, ShieldCheck, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import LocationsMultiSelect from "@/components/LocationsMultiSelect";
import ControlOverviewDialog from "@/components/ControlOverviewDialog";
import { clearBootstrapCache } from "@/lib/bootstrap";
import { apiPost, apiDelete } from "@/lib/api";

export default function ControlsPage() {
  const qc = useQueryClient();
  const { data: catalog = [] } = useControlCatalog();
  const { data: controls = [] } = useControls();
  const { data: locations = [] } = useLocations();
  const { data: findings = [] } = useAllFindings();
  const { data: ctrlLocs = [] } = useAllControlLocations();

  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [appliesAll, setAppliesAll] = useState(false);

  const [overviewControlId, setOverviewControlId] = useState<string | null>(null);
  const [overviewStartEditing, setOverviewStartEditing] = useState(false);

  // catalog_id -> control row
  const ctrlByCat = useMemo(() => {
    const m: Record<string, typeof controls[number]> = {};
    for (const c of controls) if (c.catalog_id) m[c.catalog_id] = c;
    return m;
  }, [controls]);

  // control_id -> location count
  const ctrlLocCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const cl of ctrlLocs) m[cl.control_id] = (m[cl.control_id] ?? 0) + 1;
    return m;
  }, [ctrlLocs]);

  const stats = useMemo(() => {
    const m: Record<string, { sites: number; total: number; done: number }> = {};
    for (const c of catalog) {
      const ctrl = ctrlByCat[c.id];
      const sites = ctrl
        ? ctrl.applies_to_all ? locations.length : (ctrlLocCount[ctrl.id] ?? 0)
        : 0;
      const ctrlFindings = ctrl ? findings.filter((f) => f.control_id === ctrl.id) : [];
      m[c.id] = {
        sites,
        total: ctrlFindings.length,
        done: ctrlFindings.filter((f) => f.status === "done").length,
      };
    }
    return m;
  }, [catalog, ctrlByCat, ctrlLocCount, findings, locations]);

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["control_catalog"] });
    qc.invalidateQueries({ queryKey: ["controls"] });
    qc.invalidateQueries({ queryKey: ["control_locations"] });
  };

  const reset = () => {
    setCode(""); setName(""); setDescription("");
    setLocationIds([]); setAppliesAll(false);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      const payload = { code: code.trim() || null, name: name.trim(), description: description.trim() || null };
      const res = await apiPost("control-catalog", payload);
      const catalogId = res.data.id as string;
      const ctrlRes = await apiPost("controls", {
        catalog_id: catalogId,
        name: name.trim(),
        applies_to_all: appliesAll,
      });
      const ctrl = ctrlRes.data as { id: string };
      if (!appliesAll && locationIds.length > 0) {
        await apiPost("control-locations", locationIds.map((location_id) => ({ control_id: ctrl.id, location_id })));
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Control added");
      setCreateOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = async (catalogId: string) => {
    if (!confirm("Delete this control? Findings under it will also be removed.")) return;
    try {
      const ctrl = ctrlByCat[catalogId];
      if (ctrl) await apiDelete(`controls/${ctrl.id}`);
      await apiDelete(`control-catalog/${catalogId}`);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openOverview = (ctrlId: string, startEditing = false) => {
    setOverviewControlId(ctrlId);
    setOverviewStartEditing(startEditing);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Controls</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One control per item. Choose which sites it applies to.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="gap-1.5">
            <Link to="/setup?start=controls"><Library className="h-4 w-4" /> Add from templates</Link>
          </Button>
          <Button onClick={() => { reset(); setCreateOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> New control
          </Button>
        </div>
      </header>

      {catalog.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground shadow-soft">
          No controls yet. Add your first control, or use <Link to="/setup?start=controls" className="text-primary underline">Add from templates</Link> for the recommended baseline or ISO 27001.
        </Card>
      ) : (
        <div className="space-y-3">
          {catalog.map((c) => {
            const s = stats[c.id] ?? { sites: 0, total: 0, done: 0 };
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
            const ctrl = ctrlByCat[c.id];
            return (
              <Card key={c.id} className="shadow-soft">
                <button
                  onClick={() => ctrl && openOverview(ctrl.id)}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-secondary/30"
                  disabled={!ctrl}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {c.code && <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">{c.code}</span>}
                      <span className="font-semibold">{c.name}</span>
                      {ctrl?.applies_to_all && <span className="rounded bg-primary-soft text-primary px-1.5 py-0.5 text-[11px]">All sites</span>}
                    </div>
                    {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={pct} className="h-1.5 flex-1 max-w-xs" />
                      <span className="text-xs text-muted-foreground">
                        {s.sites} site(s) · {s.done}/{s.total} findings resolved
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => ctrl && openOverview(ctrl.id, true)}>Edit</Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New control</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs">Code (optional)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. AC-01" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Access control policy" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Description</Label>
              <MarkdownEditor value={description} onChange={setDescription} rows={4} placeholder="Description..." />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={appliesAll} onCheckedChange={(v) => setAppliesAll(!!v)} />
              <span>Applies to all sites</span>
            </label>
            {!appliesAll && (
              <div>
                <Label className="mb-1.5 block text-xs">Applies to specific sites</Label>
                <LocationsMultiSelect value={locationIds} onChange={setLocationIds} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
                {create.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ControlOverviewDialog
        controlId={overviewControlId}
        initialEditing={overviewStartEditing}
        onOpenChange={(o) => {
          if (!o) { setOverviewControlId(null); setOverviewStartEditing(false); }
        }}
      />
    </div>
  );
}
