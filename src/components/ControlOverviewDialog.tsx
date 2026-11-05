import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiPost, apiDelete } from "@/lib/api";
import { clearBootstrapCache, getBootstrapData } from "@/lib/bootstrap";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useControls,
  useControlCatalog,
  useAllControlLocations,
  useLocations,
  useClients,
} from "@/lib/queries";
import LocationsMultiSelect from "@/components/LocationsMultiSelect";
import { Pencil, Plus } from "lucide-react";
import { TranslateButton } from "@/components/TranslateButton";
import { toast } from "sonner";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import type { ControlRequirement } from "@/lib/types";

const previewMdComponents: Components = {
  p: ({ children }) => <>{children}{" "}</>,
  strong: ({ node: _node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  em: ({ node: _node, ...props }) => <em className="italic" {...props} />,
  code: ({ node: _node, ...props }) => <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono" {...props} />,
  h1: ({ children }) => <>{children}{" "}</>,
  h2: ({ children }) => <>{children}{" "}</>,
  h3: ({ children }) => <>{children}{" "}</>,
  ul: ({ children }) => <>{children}</>,
  ol: ({ children }) => <>{children}</>,
  li: ({ children }) => <>{children}{" "}</>,
};

const mdComponents: Components = {
  p: ({ node: _node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="mb-2 list-disc pl-5 space-y-1" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="mb-2 list-decimal pl-5 space-y-1" {...props} />,
  li: ({ node: _node, ...props }) => <li {...props} />,
  strong: ({ node: _node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  em: ({ node: _node, ...props }) => <em className="italic" {...props} />,
  a: ({ node: _node, ...props }) => <a className="text-primary underline" target="_blank" rel="noreferrer" {...props} />,
  code: ({ node: _node, ...props }) => <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props} />,
  h1: ({ node: _node, ...props }) => <h4 className="mt-2 mb-1 font-semibold text-foreground" {...props} />,
  h2: ({ node: _node, ...props }) => <h4 className="mt-2 mb-1 font-semibold text-foreground" {...props} />,
  h3: ({ node: _node, ...props }) => <h4 className="mt-2 mb-1 font-semibold text-foreground" {...props} />,
};

export default function ControlOverviewDialog({
  controlId,
  onOpenChange,
  detached = false,
  initialEditing = false,
}: {
  controlId: string | null;
  onOpenChange: (open: boolean) => void;
  detached?: boolean;
  initialEditing?: boolean;
}) {
  const navigate = useNavigate();
  const { data: controls = [] } = useControls();
  const { data: catalog = [] } = useControlCatalog();
  const { data: ctrlLocs = [] } = useAllControlLocations();
  const { data: locations = [] } = useLocations();
  const { data: clients = [] } = useClients();

  const control = useMemo(() => controls.find((c) => c.id === controlId) ?? null, [controls, controlId]);
  const cat = control?.catalog_id ? catalog.find((c) => c.id === control.catalog_id) ?? null : null;
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const applicableSites = useMemo(() => {
    if (!control) return [];
    const locs = control.applies_to_all
      ? locations
      : locations.filter((l) => ctrlLocs.some((cl) => cl.control_id === control.id && cl.location_id === l.id));
    return locs.map((l) => ({ loc: l, client: clientById.get(l.client_id) }));
  }, [control, locations, ctrlLocs, clientById]);

  const open = detached ? !!control : (!!controlId && !!control);
  const title = cat?.name ?? control?.name ?? "Control";
  const code = cat?.code;
  const description = cat?.description ?? control?.implementation_notes ?? null;

  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [eName, setEName] = useState("");
  const [eCode, setECode] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eNotes, setENotes] = useState("");
  const [eAppliesAll, setEAppliesAll] = useState(false);
  const [eLocationIds, setELocationIds] = useState<string[]>([]);

  useEffect(() => {
    if (control) {
      setEName(cat?.name ?? control.name ?? "");
      setECode(cat?.code ?? "");
      setEDesc(cat?.description ?? "");
      setENotes(control.implementation_notes ?? "");
      setEAppliesAll(control.applies_to_all ?? false);
      setELocationIds(ctrlLocs.filter((cl) => cl.control_id === control.id).map((cl) => cl.location_id));
      setEditing(initialEditing);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [control?.id, cat?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!control) return;
      if (cat) {
        await apiPatch(`control-catalog/${cat.id}`, {
          name: eName.trim(), code: eCode.trim() || null, description: eDesc.trim() || null,
        });
      } else {
        await apiPatch(`controls/${control.id}`, { name: eName.trim() });
      }
      await apiPatch(`controls/${control.id}`, {
        implementation_notes: eNotes.trim() || null,
        applies_to_all: eAppliesAll,
      });
      const existing = new Set(ctrlLocs.filter((cl) => cl.control_id === control.id).map((cl) => cl.location_id));
      const want = new Set(eAppliesAll ? [] : eLocationIds);
      const toAdd = [...want].filter((l) => !existing.has(l));
      const toRemove = [...existing].filter((l) => !want.has(l));
      if (toAdd.length) {
        await apiPost("control-locations", toAdd.map((location_id) => ({ control_id: control.id, location_id })));
      }
      if (toRemove.length) {
        await apiDelete("control-locations", { control_id: control.id, location_ids: toRemove });
      }
    },
    onSuccess: () => {
      clearBootstrapCache();
      qc.invalidateQueries({ queryKey: ["controls"] });
      qc.invalidateQueries({ queryKey: ["control_catalog"] });
      qc.invalidateQueries({ queryKey: ["control_locations"] });
      setEditing(false);
      toast.success("Control updated");
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to update"),
  });

  const codeEl = code ? (
    detached ? (
      <Badge variant="outline" className="font-mono text-xs">{code}</Badge>
    ) : (
      <Link to={`/controls/${controlId}`} title="Open in full page">
        <Badge variant="outline" className="font-mono text-xs hover:bg-secondary">{code}</Badge>
      </Link>
    )
  ) : null;

  const headerInner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {!editing && codeEl}
          {!editing && (detached
            ? <h1 className="truncate text-xl font-semibold leading-none tracking-tight">{title}</h1>
            : <DialogTitle className="text-xl truncate">{title}</DialogTitle>
          )}
          {editing && (detached
            ? <h1 className="text-xl font-semibold leading-none tracking-tight">Edit control</h1>
            : <DialogTitle className="text-xl">Edit control</DialogTitle>
          )}
        </div>
        <div className="flex items-center gap-2">
          {detached && (
            <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>← Back</Button>
          )}
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>
      {!editing && description && (
        <div className="pt-2 text-sm leading-relaxed text-muted-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {description}
          </ReactMarkdown>
        </div>
      )}
    </>
  );

  const editForm = (
    <div className="space-y-4">
      {cat && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Code</label>
          <Input value={eCode} onChange={(e) => setECode(e.target.value)} placeholder="e.g. AC-2" />
        </div>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <TranslateButton value={eName} onChange={setEName} />
        </div>
        <Input value={eName} onChange={(e) => setEName(e.target.value)} />
      </div>
      {cat && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <TranslateButton value={eDesc} onChange={setEDesc} />
          </div>
          <MarkdownEditor value={eDesc} onChange={setEDesc} rows={6} placeholder="Description..." />
        </div>
      )}
      {control && <ControlRequirements controlId={control.id} editable />}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Implementation notes</label>
          <TranslateButton value={eNotes} onChange={setENotes} />
        </div>
        <MarkdownEditor value={eNotes} onChange={setENotes} rows={6} placeholder="Notes..." />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox checked={eAppliesAll} onCheckedChange={(v) => setEAppliesAll(!!v)} />
        <span>Applies to all sites</span>
      </label>
      {!eAppliesAll && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Applies to specific sites</label>
          <LocationsMultiSelect value={eLocationIds} onChange={setELocationIds} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !eName.trim()}>
          {save.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );

  const viewBody = (
    <div className="space-y-6 pt-2">
      {control && <ControlRequirements controlId={control.id} />}
      {control?.implementation_notes && cat?.description && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Implementation notes
          </h3>
          <div className="text-sm text-muted-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {control.implementation_notes}
            </ReactMarkdown>
          </div>
        </section>
      )}
      {applicableSites.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sites ({applicableSites.length})
            {control?.applies_to_all && <span className="ml-2 font-normal normal-case text-muted-foreground/70">— all sites</span>}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {applicableSites.map(({ loc, client }) => (
              <Badge key={loc.id} variant="secondary" className="text-xs">
                {client?.name} · {loc.name}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  if (detached) {
    return (
      <div>
        <div className="sticky top-0 z-10 border-b border-border bg-background px-6 pb-3 pt-6">
          <div className="mx-auto max-w-3xl">
            {headerInner}
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
          {editing ? editForm : viewBody}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          {headerInner}
        </DialogHeader>
        {editing ? editForm : viewBody}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Requirements ---------- */

const EMPTY_REQ = { title: "", text: "", source_party: "", source_name: "", source_department: "", source_document: "" };

function ControlRequirements({ controlId, editable = false }: { controlId: string; editable?: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_REQ });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, typeof EMPTY_REQ>>({});
  const [openPreviews, setOpenPreviews] = useState<Set<string>>(new Set());
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  function togglePreview(id: string) {
    setOpenPreviews((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data: requirements = [] } = useQuery({
    queryKey: ["control_requirements", controlId],
    queryFn: async (): Promise<ControlRequirement[]> => {
      const data = await getBootstrapData();
      return (data.control_requirements as ControlRequirement[]).filter((r) => r.control_id === controlId);
    },
  });

  const { data: sourceSuggestions = { party: [], name: [], department: [], document: [] } } = useQuery({
    queryKey: ["requirement_sources"],
    queryFn: async () => {
      const data = await getBootstrapData();
      const raw = (data.requirement_sources ?? []) as { field: string; value: string }[];
      return {
        party:      raw.filter((s) => s.field === "party").map((s) => s.value),
        name:       raw.filter((s) => s.field === "name").map((s) => s.value),
        department: raw.filter((s) => s.field === "department").map((s) => s.value),
        document:   raw.filter((s) => s.field === "document").map((s) => s.value),
      };
    },
  });

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["control_requirements", controlId] });
    qc.invalidateQueries({ queryKey: ["requirement_sources"] });
  };

  const add = useMutation({
    mutationFn: () => apiPost("control-requirements", { control_id: controlId, ...form }),
    onSuccess: () => { invalidate(); setAdding(false); setForm({ ...EMPTY_REQ }); toast.success("Requirement added"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof EMPTY_REQ }) =>
      apiPatch(`control-requirements/${id}`, data),
    onSuccess: (_, { id }) => { invalidate(); setExpandedId(null); setEditForm((p) => { const n = { ...p }; delete n[id]; return n; }); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`control-requirements/${id}`),
    onSuccess: () => { invalidate(); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(r: ControlRequirement) {
    setEditForm((p) => ({
      ...p,
      [r.id]: {
        title: r.title ?? "",
        text: r.text,
        source_party: r.source_party ?? "",
        source_name: r.source_name ?? "",
        source_department: r.source_department ?? "",
        source_document: r.source_document ?? "",
      },
    }));
    setExpandedId(r.id);
  }

  function attribution(r: ControlRequirement) {
    return [r.source_party, r.source_name, r.source_department, r.source_document].filter(Boolean).join(" · ");
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirements</h3>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>

      {editable && adding && (
        <RequirementForm
          form={form}
          onChange={(k, v) => setForm((p) => ({ ...p, [k]: v }))}
          onSave={() => add.mutate()}
          onCancel={() => { setAdding(false); setForm({ ...EMPTY_REQ }); }}
          saving={add.isPending}
          sources={sourceSuggestions}
        />
      )}

      {requirements.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">No requirements defined yet.</p>
      ) : (
        <ul className="space-y-2">
          {requirements.map((r) => {
            const isEditing = editable && expandedId === r.id && editForm[r.id];
            const attr = attribution(r);
            return (
              <li key={r.id} className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                {isEditing ? (
                  <RequirementForm
                    form={editForm[r.id]}
                    onChange={(k, v) => setEditForm((p) => ({ ...p, [r.id]: { ...p[r.id], [k]: v } }))}
                    onSave={() => update.mutate({ id: r.id, data: editForm[r.id] })}
                    onCancel={() => { setExpandedId(null); setEditForm((p) => { const n = { ...p }; delete n[r.id]; return n; }); }}
                    saving={update.isPending}
                    onDelete={() => remove.mutate(r.id)}
                    sources={sourceSuggestions}
                  />
                ) : (() => {
                  const isOpen = openPreviews.has(r.id);
                  return (
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="min-w-0 flex-1 cursor-pointer select-text"
                      onMouseDown={(e) => { dragStart.current = { x: e.clientX, y: e.clientY }; }}
                      onClick={(e) => {
                        if (dragStart.current) {
                          const dx = e.clientX - dragStart.current.x;
                          const dy = e.clientY - dragStart.current.y;
                          if (dx * dx + dy * dy > 25) return;
                        }
                        togglePreview(r.id);
                      }}
                    >
                      {r.title && <p className="text-sm font-semibold leading-snug">{r.title}</p>}
                      <div
                        className={`relative overflow-hidden ${r.title ? "mt-0.5" : ""}`}
                        style={{
                          maxHeight: isOpen ? "600px" : "3rem",
                          transition: "max-height 300ms ease-in-out",
                        }}
                      >
                        <div className={`text-sm leading-relaxed ${r.title ? "text-muted-foreground" : "font-medium"}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                            {r.text}
                          </ReactMarkdown>
                        </div>
                        {!isOpen && (
                          <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-secondary/80 to-transparent pointer-events-none" />
                        )}
                      </div>
                      {attr && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          <span className="font-medium">Source:</span> {attr}
                        </p>
                      )}
                      {!attr && (
                        <p className="mt-1 text-[11px] italic text-muted-foreground/60">No source attributed</p>
                      )}
                    </div>
                    {editable && (
                      <button onClick={() => startEdit(r)} className="shrink-0 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  );
                })()}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type Sources = { party: string[]; name: string[]; department: string[]; document: string[] };

function SourceInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()
  );

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.map((s) => (
            <li
              key={s}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RequirementForm({
  form, onChange, onSave, onCancel, saving, onDelete, sources,
}: {
  form: { title: string; text: string; source_party: string; source_name: string; source_department: string; source_document: string };
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  onDelete?: () => void;
  sources?: Sources;
}) {
  const s = sources ?? { party: [], name: [], department: [], document: [] };
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <div>
        <Label className="mb-1 block text-xs">Title</Label>
        <Input
          value={form.title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="Short title for this requirement"
        />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Requirement</Label>
        <MarkdownEditor
          rows={4}
          value={form.text}
          onChange={(v) => onChange("text", v)}
          placeholder="Describe the requirement..."
        />
      </div>
      <div>
        <Label className="mb-1 block text-xs">Source attribution</Label>
        <p className="mb-2 text-[11px] text-muted-foreground leading-relaxed">
          To trace where this requirement came from in the future — fill in at least one: the
          organization or party imposing it, the person who raised it, their department, or a
          document / standard reference (e.g. <span className="font-mono">ISO 27001:2022 §A.5.1</span>).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Party / Organization</Label>
            <SourceInput
              value={form.source_party}
              onChange={(v) => onChange("source_party", v)}
              suggestions={s.party}
              placeholder="e.g. ISO, Client ABC"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Person</Label>
            <SourceInput
              value={form.source_name}
              onChange={(v) => onChange("source_name", v)}
              suggestions={s.name}
              placeholder="e.g. Jane Smith"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Department</Label>
            <SourceInput
              value={form.source_department}
              onChange={(v) => onChange("source_department", v)}
              suggestions={s.department}
              placeholder="e.g. Risk & Compliance"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Document / Standard reference</Label>
            <SourceInput
              value={form.source_document}
              onChange={(v) => onChange("source_document", v)}
              suggestions={s.document}
              placeholder="e.g. ISO 27001:2022 §A.5.1"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <button onClick={onDelete} className="text-xs text-destructive hover:underline">Delete</button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={saving || !form.text.trim() || ![form.source_party, form.source_name, form.source_department, form.source_document].some((v) => v.trim())}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
