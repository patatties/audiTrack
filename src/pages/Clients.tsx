import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClients, useLocations, useControls, useControlCatalog, useAllControlLocations } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Building2, MapPin, ShieldCheck, Plus, ChevronDown, ChevronRight, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/lib/types";
import { clearBootstrapCache } from "@/lib/bootstrap";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";

export default function ClientsPage() {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const { data: locations = [] } = useLocations();
  const { data: controls = [] } = useControls();
  const { data: catalog = [] } = useControlCatalog();
  const { data: ctrlLocs = [] } = useAllControlLocations();
  const [openClient, setOpenClient] = useState<Record<string, boolean>>({});
  const [openLoc, setOpenLoc] = useState<Record<string, boolean>>({});
  const [newClient, setNewClient] = useState("");
  const [newLoc, setNewLoc] = useState<Record<string, string>>({});
  const [pickCatalog, setPickCatalog] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Client | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["locations"] });
    qc.invalidateQueries({ queryKey: ["controls"] });
    qc.invalidateQueries({ queryKey: ["control_locations"] });
  };

  const addClient = useMutation({
    mutationFn: async () => {
      if (!newClient.trim()) return;
      await apiPost("clients", { name: newClient.trim() });
    },
    onSuccess: () => { setNewClient(""); invalidate(); toast.success("Client added"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (c: Client) => {
    setEditing(c);
    setEditName(c.name);
    setEditDesc(c.description ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await apiPatch(`clients/${editing.id}`, {
        name: editName.trim() || editing.name,
        description: editDesc.trim() || null,
      });
      setEditing(null);
      invalidate();
      toast.success("Client updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Clients</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage clients, their locations and controls.</p>
      </header>

      <Card className="flex gap-2 p-4 shadow-soft">
        <Input
          placeholder="New client name..."
          value={newClient}
          onChange={(e) => setNewClient(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addClient.mutate()}
        />
        <Button onClick={() => addClient.mutate()} className="gap-1.5"><Plus className="h-4 w-4" />Add client</Button>
      </Card>

      <div className="space-y-3">
        {clients.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground shadow-soft">
            No clients yet. Add your first client above.
          </Card>
        )}
        {clients.map((client) => {
          const clientLocs = locations.filter((l) => l.client_id === client.id);
          const isOpen = openClient[client.id] === true;
          return (
            <Card key={client.id} className="shadow-soft">
              <div className="flex items-center gap-3 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setOpenClient((p) => ({ ...p, [client.id]: !isOpen }))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Building2 className="h-5 w-5 text-primary" />
                <button
                  type="button"
                  onClick={() => openEdit(client)}
                  className="flex-1 text-left group"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold group-hover:underline">{client.name}</span>
                    <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                  {client.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{client.description}</p>
                  )}
                </button>
                <span className="text-xs text-muted-foreground">{clientLocs.length} location(s)</span>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm("Delete client and all its data?")) return;
                    try {
                      await apiDelete(`clients/${client.id}`);
                      invalidate();
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-border bg-secondary/30 px-5 py-4 space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="New location..."
                      value={newLoc[client.id] ?? ""}
                      onChange={(e) => setNewLoc((p) => ({ ...p, [client.id]: e.target.value }))}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && (newLoc[client.id] ?? "").trim()) {
                          try {
                            await apiPost("locations", { client_id: client.id, name: newLoc[client.id].trim() });
                            setNewLoc((p) => ({ ...p, [client.id]: "" }));
                            invalidate();
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }
                      }}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const v = (newLoc[client.id] ?? "").trim();
                        if (!v) return;
                        try {
                          await apiPost("locations", { client_id: client.id, name: v });
                          setNewLoc((p) => ({ ...p, [client.id]: "" }));
                          invalidate();
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {clientLocs.map((loc) => {
                    const ctrlIdsAtLoc = new Set(ctrlLocs.filter((cl) => cl.location_id === loc.id).map((cl) => cl.control_id));
                    const sys = controls.filter((s) => ctrlIdsAtLoc.has(s.id));
                    const lopen = openLoc[loc.id] === true;
                    return (
                      <div key={loc.id} className="rounded-lg border border-border bg-card">
                        <div className="flex items-center gap-3 px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setOpenLoc((p) => ({ ...p, [loc.id]: !lopen }))}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={lopen ? "Collapse" : "Expand"}
                          >
                            {lopen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-sm font-medium">{loc.name}</span>
                          <span className="text-xs text-muted-foreground">{sys.length} control(s)</span>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiDelete(`locations/${loc.id}`);
                                invalidate();
                              } catch (err) {
                                toast.error((err as Error).message);
                              }
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {lopen && (
                          <div className="border-t border-border px-4 py-3 space-y-2">
                            <div className="flex gap-2">
                              <Select
                                value={pickCatalog[loc.id] ?? ""}
                                onValueChange={(v) => setPickCatalog((p) => ({ ...p, [loc.id]: v }))}
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder={catalog.length ? "Pick a control from catalog..." : "No catalog controls yet"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {catalog
                                    .filter((c) => !sys.some((s) => s.catalog_id === c.id))
                                    .map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.code ? `${c.code} · ` : ""}{c.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={!pickCatalog[loc.id]}
                                onClick={async () => {
                                  const catId = pickCatalog[loc.id];
                                  if (!catId) return;
                                  const cat = catalog.find((c) => c.id === catId);
                                  if (!cat) return;
                                  try {
                                    let ctrl = controls.find((c) => c.catalog_id === cat.id);
                                    if (!ctrl) {
                                      const res = await apiPost("controls", {
                                        name: cat.name,
                                        catalog_id: cat.id,
                                      });
                                      ctrl = res.data as typeof ctrl;
                                    }
                                    if (ctrl) {
                                      await apiPost("control-locations", { control_id: ctrl.id, location_id: loc.id });
                                    }
                                    setPickCatalog((p) => ({ ...p, [loc.id]: "" }));
                                    invalidate();
                                  } catch (err) {
                                    toast.error((err as Error).message);
                                  }
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            {sys.map((s) => {
                              const cat = catalog.find((c) => c.id === s.catalog_id);
                              return (
                                <div key={s.id} className="flex items-center gap-2 rounded-md bg-secondary/40 px-3 py-2 text-sm">
                                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="flex-1">
                                    {cat?.code && <span className="mr-1.5 rounded bg-background px-1.5 py-0.5 font-mono text-xs">{cat.code}</span>}
                                    {s.name}
                                  </span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await apiDelete("control-locations", { control_id: s.id, location_id: loc.id });
                                        invalidate();
                                      } catch (err) {
                                        toast.error((err as Error).message);
                                      }
                                    }}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit client</DialogTitle>
            <DialogDescription>Update the client name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={5}
                placeholder="Notes, context, key contacts..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
