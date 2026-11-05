import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClients, useLocations, useControls } from "@/lib/queries";
import { SEVERITIES, STATUSES, type FindingSeverity, type FindingStatus } from "@/lib/types";
import { toast } from "sonner";
import { clearBootstrapCache } from "@/lib/bootstrap";
import { apiPost } from "@/lib/api";
import { TranslateButton } from "@/components/TranslateButton";

export default function NewFindingDialog({
  open,
  onOpenChange,
  initialTitle,
  initialDescription,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialTitle?: string;
  initialDescription?: string;
  onCreated?: () => void;
}) {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState<string>("");
  const { data: locations = [] } = useLocations(clientId || undefined);
  const [locationId, setLocationId] = useState<string>("");
  const { data: controls = [] } = useControls(locationId || undefined);
  const [controlId, setControlId] = useState<string>("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<FindingSeverity>("medium");
  const [status, setStatus] = useState<FindingStatus>("todo");
  const [assignee, setAssignee] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(initialTitle ?? "");
      setDescription(initialDescription ?? "");
    } else {
      setTitle(""); setDescription(""); setSeverity("medium"); setStatus("todo");
      setAssignee(""); setClientId(""); setLocationId(""); setControlId("");
    }
  }, [open, initialTitle, initialDescription]);

  const create = useMutation({
    mutationFn: async () => {
      if (!controlId) throw new Error("Select client, location and control");
      if (!locationId) throw new Error("Select a location");
      if (!title.trim()) throw new Error("Title is required");
      await apiPost("findings", {
        control_id: controlId,
        location_id: locationId,
        title: title.trim(),
        description: description.trim() || null,
        severity,
        status,
        assignee: assignee.trim() || null,
      });
    },
    onSuccess: () => {
      clearBootstrapCache();
      qc.invalidateQueries({ queryKey: ["findings"] });
      toast.success("Finding created");
      onCreated?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New finding</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="mb-1.5 block text-xs">Client</Label>
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setLocationId(""); setControlId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Location</Label>
              <Select value={locationId} onValueChange={(v) => { setLocationId(v); setControlId(""); }} disabled={!clientId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Control</Label>
              <Select value={controlId} onValueChange={setControlId} disabled={!locationId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {controls.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-xs">Title</Label>
              <TranslateButton value={title} onChange={setTitle} />
            </div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the finding" />
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
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
