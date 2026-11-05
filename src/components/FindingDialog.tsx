import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFinding, useClients, useLocations, useControls } from "@/lib/queries";
import { SEVERITIES, STATUSES, type FindingSeverity, type FindingStatus, type RemediationPlan } from "@/lib/types";
import { toast } from "sonner";
import { Trash2, Plus, X, Wrench } from "lucide-react";
import { TranslateButton } from "@/components/TranslateButton";
import { SeverityBadge } from "./SeverityBadge";
import RemediationPlanDialog from "@/components/RemediationPlanDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getBootstrapData, clearBootstrapCache } from "@/lib/bootstrap";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";

export default function FindingDialog({
  id,
  onOpenChange,
  detached = false,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
  detached?: boolean;
}) {
  const open = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: finding } = useFinding(id ?? undefined);
  const { data: clients = [] } = useClients();
  const { data: locations = [] } = useLocations();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<FindingSeverity>("medium");
  const [status, setStatus] = useState<FindingStatus>("todo");
  const [assignee, setAssignee] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  const [controlId, setControlId] = useState<string>("");

  useEffect(() => {
    if (finding) {
      setTitle(finding.title);
      setDescription(finding.description ?? "");
      setSeverity(finding.severity);
      setStatus(finding.status);
      setAssignee(finding.assignee ?? "");
      setCreatedAt(finding.created_at ? finding.created_at.slice(0, 10) : "");
      setLocationId(finding.location_id);
      setControlId(finding.control_id);
    }
  }, [finding?.id]);

  const loc = locations.find((l) => l.id === locationId);
  const client = loc ? clients.find((c) => c.id === loc.client_id) : null;
  const { data: controls = [] } = useControls(locationId || undefined);

  const invalidateFindings = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["findings"] });
    qc.invalidateQueries({ queryKey: ["finding", id] });
  };

  function handleClose() {
    if (detached) navigate(-1);
    else onOpenChange(false);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!id) return;
      await apiPatch(`findings/${id}`, {
        title, description: description || null, severity, status,
        assignee: assignee || null,
        location_id: locationId,
        control_id: controlId,
        created_at: createdAt || null,
      });
    },
    onSuccess: () => {
      invalidateFindings();
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!id) return;
      await apiDelete(`findings/${id}`);
    },
    onSuccess: () => {
      invalidateFindings();
      toast.success("Deleted");
      if (detached) navigate("/board");
      else onOpenChange(false);
    },
  });

  const actionButtons = finding ? (
    <div className={`flex items-center gap-2 ${detached ? "" : "pr-6"}`}>
      {detached && (
        <Button variant="ghost" size="sm" onClick={handleClose}>← Back</Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive">
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this finding?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!detached && <Button variant="ghost" size="sm" onClick={handleClose}>Close</Button>}
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
    </div>
  ) : null;

  const formContent = !finding ? (
    <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
  ) : (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-xs">Title</Label>
          <TranslateButton value={title} onChange={setTitle} />
        </div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-xs">Description</Label>
          <TranslateButton value={description} onChange={setDescription} />
        </div>
        <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <Label className="mb-1.5 block text-xs">Severity</Label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as FindingSeverity)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as FindingStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Assignee</Label>
          <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Created</Label>
          <Input type="date" value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} />
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs">Site</Label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
          <SelectContent>
            {locations.map((l) => {
              const c = clients.find((cl) => cl.id === l.client_id);
              return <SelectItem key={l.id} value={l.id}>{c?.name ?? "?"} · {l.name}</SelectItem>;
            })}
          </SelectContent>
        </Select>
        {client && loc && (
          <p className="mt-1 text-xs text-muted-foreground">{client.name} · {loc.name}</p>
        )}
      </div>

      <div>
        <Label className="mb-1.5 block text-xs">Control</Label>
        <Select value={controlId} onValueChange={setControlId}>
          <SelectTrigger><SelectValue placeholder="Select control" /></SelectTrigger>
          <SelectContent>
            {controls.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FindingPlans findingId={finding.id} />
    </div>
  );

  if (detached) {
    return (
      <div>
        <div className="sticky top-0 z-10 border-b border-border bg-background px-6 pb-3 pt-6">
          <div className="mx-auto max-w-4xl flex items-center justify-between gap-3">
            <h1 className="flex items-center gap-3 text-lg font-semibold leading-none tracking-tight">
              Finding
              {finding && <SeverityBadge severity={finding.severity} />}
              {id && (
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  #{id.slice(0, 8)}
                </span>
              )}
            </h1>
            {actionButtons}
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-6 py-6">
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95vh] min-h-[70vh] max-w-4xl flex-col overflow-y-auto">
        <DialogHeader className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-border bg-background px-6 pb-3 pt-6">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-3">
              Edit finding
              {finding && <SeverityBadge severity={finding.severity} />}
              {id && (
                <Link
                  to={`/findings/${id}`}
                  className="font-mono text-xs font-normal text-muted-foreground hover:text-foreground"
                  title="Open in full page"
                >
                  #{id.slice(0, 8)}
                </Link>
              )}
            </DialogTitle>
            {actionButtons}
          </div>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

function FindingPlans({ findingId }: { findingId: string }) {
  const qc = useQueryClient();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: allPlans = [] } = useQuery({
    queryKey: ["remediation_plans"],
    queryFn: async (): Promise<RemediationPlan[]> => {
      const data = await getBootstrapData();
      return (data.remediation_plans as RemediationPlan[]).sort((a, b) =>
        (a.code ?? "zzz").localeCompare(b.code ?? "zzz")
      );
    },
  });

  const { data: linkedIds = [] } = useQuery({
    queryKey: ["plan-findings-by-finding", findingId],
    queryFn: async (): Promise<string[]> => {
      const data = await getBootstrapData();
      return (data.remediation_plan_findings as { plan_id: string; finding_id: string }[])
        .filter((r) => r.finding_id === findingId)
        .map((r) => r.plan_id);
    },
  });

  const linkedSet = new Set(linkedIds);
  const linked = allPlans.filter((p) => linkedSet.has(p.id));
  const available = allPlans.filter((p) => !linkedSet.has(p.id));

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["plan-findings-by-finding", findingId] });
    qc.invalidateQueries({ queryKey: ["plan-findings"] });
    qc.invalidateQueries({ queryKey: ["plan-findings-all"] });
    qc.invalidateQueries({ queryKey: ["remediation_plans"] });
  };

  const attach = useMutation({
    mutationFn: async (planId: string) => {
      await apiPost("remediation-plan-findings", { plan_id: planId, finding_id: findingId });
    },
    onSuccess: invalidate,
  });

  const detach = useMutation({
    mutationFn: async (planId: string) => {
      await apiDelete("remediation-plan-findings", { plan_id: planId, finding_id: findingId });
    },
    onSuccess: invalidate,
  });

  const createAndLink = useMutation({
    mutationFn: async () => {
      const data = await getBootstrapData();
      const existing = data.remediation_plans as { code: string | null }[];
      const max = existing.reduce((acc, r) => {
        const m = r.code?.match(/^RP-(\d+)$/);
        const n = m ? parseInt(m[1], 10) : 0;
        return n > acc ? n : acc;
      }, 0);
      const nextCode = `RP-${String(max + 1).padStart(3, "0")}`;
      const res = await apiPost("remediation-plans", { code: nextCode, title: "Untitled plan" });
      const plan = res.data as RemediationPlan;
      await apiPost("remediation-plan-findings", { plan_id: plan.id, finding_id: findingId });
      return plan.id;
    },
    onSuccess: (planId) => {
      invalidate();
      setOpenPlanId(planId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Remediation plans</h3>
        <div className="flex gap-2">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1 h-3.5 w-3.5" /> Link plan
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <Command>
                <CommandInput placeholder="Search plans..." />
                <CommandList>
                  <CommandEmpty>No plans found.</CommandEmpty>
                  <CommandGroup>
                    {available.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`${p.code ?? ""} ${p.title}`}
                        onSelect={() => { attach.mutate(p.id); setPickerOpen(false); }}
                      >
                        <Wrench className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        {p.code && <span className="mr-2 font-mono text-[10px] text-muted-foreground">{p.code}</span>}
                        <span className="flex-1 truncate">{p.title}</span>
                      </CommandItem>
                    ))}
                    {available.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground">No more plans to link.</div>
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button size="sm" onClick={() => createAndLink.mutate()} disabled={createAndLink.isPending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New plan
          </Button>
        </div>
      </div>
      {linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">No remediation plans linked yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {linked.map((p) => {
            return (
              <li key={p.id} className="group flex items-center gap-2 rounded-md bg-secondary/50 px-2 py-1.5">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                {p.code && <Badge variant="outline" className="font-mono text-[10px]">{p.code}</Badge>}
                <button
                  onClick={() => setOpenPlanId(p.id)}
                  className="flex-1 truncate text-left text-sm hover:text-primary"
                >
                  {p.title}
                </button>
                <Badge variant="outline" className="text-[10px]">
                  {STATUSES.find((s) => s.value === p.status)?.label}
                </Badge>
                <button
                  onClick={() => detach.mutate(p.id)}
                  className="opacity-0 group-hover:opacity-100"
                  title="Unlink"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <RemediationPlanDialog id={openPlanId} onOpenChange={(o) => !o && setOpenPlanId(null)} />
    </div>
  );
}
