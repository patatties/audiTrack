import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAllFindings, useControls, useControlCatalog, useLocations, useClients } from "@/lib/queries";
import { STATUSES, type Attachment, type Comment, type FindingStatus, type RemediationPlan } from "@/lib/types";
import { toast } from "sonner";
import { Trash2, Plus, Paperclip, Download, X, Link2, Eye, FileText, FileImage, File } from "lucide-react";
import { TranslateButton } from "@/components/TranslateButton";
import { SolutionLinks } from "@/components/SolutionLinks";
import { SeverityBadge } from "@/components/SeverityBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getBootstrapData, clearBootstrapCache } from "@/lib/bootstrap";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";

export function useRemediationPlan(id: string | undefined) {
  return useQuery({
    queryKey: ["remediation_plan", id],
    enabled: !!id,
    queryFn: async (): Promise<RemediationPlan | null> => {
      if (!id) return null;
      const data = await getBootstrapData();
      return (data.remediation_plans as RemediationPlan[]).find((p) => p.id === id) ?? null;
    },
  });
}

export default function RemediationPlanDialog({
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
  const { data: plan } = useRemediationPlan(id ?? undefined);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<FindingStatus>("todo");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [effortDays, setEffortDays] = useState<string>("");
  const [createdAt, setCreatedAt] = useState("");

  useEffect(() => {
    if (plan) {
      setTitle(plan.title);
      setDescription(plan.description ?? "");
      setStatus(plan.status);
      setAssignee(plan.assignee ?? "");
      setDueDate(plan.due_date ?? "");
      setEffortDays(plan.effort_days != null ? String(plan.effort_days) : "");
      setCreatedAt(plan.created_at ? plan.created_at.slice(0, 10) : "");
    }
  }, [plan?.id]);

  const invalidatePlans = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["remediation_plans"] });
    qc.invalidateQueries({ queryKey: ["remediation_plan", id] });
    qc.invalidateQueries({ queryKey: ["plan-findings-all"] });
  };

  function handleClose() {
    if (detached) navigate(-1);
    else onOpenChange(false);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!id) return;
      await apiPatch(`remediation-plans/${id}`, {
        title: title.trim() || "Untitled plan",
        description: description || null,
        status,
        assignee: assignee || null,
        due_date: dueDate || null,
        effort_days: effortDays === "" ? null : Number(effortDays),
        created_at: createdAt || null,
      });
    },
    onSuccess: () => {
      invalidatePlans();
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!id) return;
      await apiDelete(`remediation-plans/${id}`);
    },
    onSuccess: () => {
      invalidatePlans();
      toast.success("Deleted");
      if (detached) navigate("/remediation");
      else onOpenChange(false);
    },
  });

  const codeEl = plan?.code ? (
    detached ? (
      <span className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 font-mono text-xs text-muted-foreground">
        {plan.code}
      </span>
    ) : (
      <Link
        to={`/remediation/${id}`}
        className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground"
        title="Open in full page"
      >
        {plan.code}
      </Link>
    )
  ) : null;

  const actionButtons = plan ? (
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
            <AlertDialogTitle>Delete this remediation plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also delete its comments and attachments. This action cannot be undone.
            </AlertDialogDescription>
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

  const formContent = !plan ? (
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
        <Textarea rows={10} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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
          <Label className="mb-1.5 block text-xs">Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Effort (days)</Label>
          <Input
            type="number"
            min="0"
            step="0.5"
            value={effortDays}
            onChange={(e) => setEffortDays(e.target.value)}
            placeholder="e.g. 3"
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Created</Label>
          <Input type="date" value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} />
        </div>
      </div>

      <PlanFindings planId={plan.id} />
      <SolutionLinks kind="plan" parentId={plan.id} />
      <Comments planId={plan.id} />
      <Attachments planId={plan.id} />
    </div>
  );

  if (detached) {
    return (
      <div>
        <div className="sticky top-0 z-10 border-b border-border bg-background px-6 pb-3 pt-6">
          <div className="mx-auto max-w-3xl flex items-center justify-between gap-3">
            <h1 className="flex items-center gap-3 text-lg font-semibold leading-none tracking-tight">
              Remediation plan
              {codeEl}
            </h1>
            {actionButtons}
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-6 py-6">
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-border bg-background px-6 pb-3 pt-6">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-3">
              Remediation plan
              {codeEl}
            </DialogTitle>
            {actionButtons}
          </div>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Linked findings ---------- */

function PlanFindings({ planId }: { planId: string }) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: findings = [] } = useAllFindings();
  const { data: controls = [] } = useControls();
  const { data: catalog = [] } = useControlCatalog();
  const { data: locations = [] } = useLocations();
  const { data: clients = [] } = useClients();

  const { data: linkedIds = [] } = useQuery({
    queryKey: ["plan-findings", planId],
    queryFn: async (): Promise<string[]> => {
      const data = await getBootstrapData();
      return (data.remediation_plan_findings as { plan_id: string; finding_id: string }[])
        .filter((r) => r.plan_id === planId)
        .map((r) => r.finding_id);
    },
  });

  const linkedSet = new Set(linkedIds);
  const linked = findings.filter((f) => linkedSet.has(f.id));
  const available = findings.filter((f) => !linkedSet.has(f.id));

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["plan-findings", planId] });
    qc.invalidateQueries({ queryKey: ["plan-findings-all"] });
  };

  function describe(fid: string) {
    const f = findings.find((x) => x.id === fid);
    if (!f) return { f: null, sub: "" };
    const ctrl = controls.find((c) => c.id === f.control_id);
    const cat = ctrl?.catalog_id ? catalog.find((c) => c.id === ctrl.catalog_id) : null;
    const loc = locations.find((l) => l.id === f.location_id);
    const client = loc ? clients.find((c) => c.id === loc.client_id) : null;
    const sub = [cat ? `${cat.code ? cat.code + " · " : ""}${cat.name}` : null, client?.name, loc?.name]
      .filter(Boolean).join(" · ");
    return { f, sub };
  }

  const attach = useMutation({
    mutationFn: async (fid: string) => {
      await apiPost("remediation-plan-findings", { plan_id: planId, finding_id: fid });
    },
    onSuccess: invalidate,
  });

  const detach = useMutation({
    mutationFn: async (fid: string) => {
      await apiDelete("remediation-plan-findings", { plan_id: planId, finding_id: fid });
    },
    onSuccess: invalidate,
  });

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Linked findings</h3>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-3.5 w-3.5" /> Link finding
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="end">
            <Command>
              <CommandInput placeholder="Search findings..." />
              <CommandList>
                <CommandEmpty>No findings found.</CommandEmpty>
                <CommandGroup>
                  {available.map((f) => {
                    const { sub } = describe(f.id);
                    return (
                      <CommandItem
                        key={f.id}
                        value={`${f.title} ${sub}`}
                        onSelect={() => { attach.mutate(f.id); setPickerOpen(false); }}
                      >
                        <Link2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{f.title}</div>
                          {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
                        </div>
                        <SeverityBadge severity={f.severity} />
                      </CommandItem>
                    );
                  })}
                  {available.length === 0 && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">All findings already linked.</div>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">No findings linked yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {linked.map((f) => {
            const { sub } = describe(f.id);
            return (
              <li key={f.id} className="group flex items-center gap-2 rounded-md bg-secondary/50 px-2 py-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{f.title}</div>
                  {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
                </div>
                <SeverityBadge severity={f.severity} />
                <Badge variant="outline" className="text-[10px]">
                  {STATUSES.find((s) => s.value === f.status)?.label}
                </Badge>
                <button
                  onClick={() => detach.mutate(f.id)}
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
    </div>
  );
}

/* ---------- Paste-upload helpers (shared) ---------- */

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPastedFiles(planId: string, files: File[]): Promise<string> {
  const snippets: string[] = [];
  for (const file of files) {
    const data = await fileToBase64(file);
    const res = await fetch("/api/attachment-upload-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, name: file.name, type: file.type, data }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Upload failed ${res.status}`);
    const { id } = await res.json();
    const downloadUrl = `/api/attachment-download/${id}`;
    if (file.type.startsWith("image/")) snippets.push(`![${file.name}](${downloadUrl})`);
    else snippets.push(`[${file.name}](${downloadUrl})`);
  }
  return snippets.join("\n");
}

function usePasteUpload(planId: string, value: string, setValue: (v: string) => void) {
  const [uploading, setUploading] = useState(false);
  async function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items.filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => !!f);
    if (files.length === 0) return;
    e.preventDefault();
    setUploading(true);
    try {
      const md = await uploadPastedFiles(planId, files);
      const target = e.currentTarget;
      const start = target.selectionStart ?? value.length;
      const end = target.selectionEnd ?? value.length;
      const insert = (value && start === value.length && !value.endsWith("\n") ? "\n" : "") + md;
      const next = value.slice(0, start) + insert + value.slice(end);
      setValue(next);
      toast.success(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return { onPaste, uploading };
}

function CommentBody({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  const re = /(!?)\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{body.slice(last, m.index)}</span>);
    const [, bang, label, url] = m;
    if (bang === "!") {
      parts.push(
        <a key={key++} href={url} target="_blank" rel="noreferrer" className="my-1 block">
          <img src={url} alt={label} className="max-h-64 max-w-full rounded-md border border-border" />
        </a>,
      );
    } else {
      parts.push(
        <a key={key++} href={url} target="_blank" rel="noreferrer" className="text-primary underline">
          {label || url}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(<span key={key++}>{body.slice(last)}</span>);
  return <div className="text-sm whitespace-pre-wrap break-words">{parts}</div>;
}

/* ---------- Comments ---------- */

function Comments({ planId }: { planId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", planId],
    queryFn: async (): Promise<Comment[]> => {
      const data = await getBootstrapData();
      return (data.comments as Comment[])
        .filter((c) => c.plan_id === planId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
  });

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["comments", planId] });
  };

  const { onPaste, uploading } = usePasteUpload(planId, body, setBody);

  const addComment = async () => {
    if (!body.trim()) return;
    try {
      await apiPost("comments", { plan_id: planId, body: body.trim(), author: author.trim() || null });
      setBody("");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold">Activity</h3>
      <div className="space-y-3">
        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} planId={planId} onChanged={invalidate} />
        ))}
        {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
      </div>
      <div className="mt-3 space-y-2">
        <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name (optional)" />
        <div className="relative">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={onPaste}
            placeholder="Add a comment... (paste images or files with Ctrl+V)"
            rows={3}
            className="pr-8"
          />
          <TranslateButton value={body} onChange={setBody} className="absolute right-1 top-1 h-6 w-6" />
        </div>
        {uploading && <p className="text-xs text-muted-foreground">Uploading pasted file...</p>}
        <Button size="sm" disabled={uploading} onClick={addComment}>
          Post comment
        </Button>
      </div>
    </div>
  );
}

function CommentItem({ comment, planId, onChanged }: { comment: Comment; planId: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const { onPaste, uploading } = usePasteUpload(planId, body, setBody);

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await apiPatch(`comments/${comment.id}`, { body: body.trim() });
      setSaving(false);
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  }

  async function doRemove() {
    try {
      await apiDelete(`comments/${comment.id}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="rounded-lg bg-secondary/60 p-3">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.author || "Anonymous"}</span>
        <div className="flex items-center gap-2">
          <span>{new Date(comment.created_at).toLocaleString()}</span>
          {!editing && (
            <>
              <button onClick={() => setEditing(true)} className="hover:text-foreground">Edit</button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="hover:text-destructive">Delete</button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={doRemove}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="relative">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} onPaste={onPaste} rows={3} className="pr-8" />
            <TranslateButton value={body} onChange={setBody} className="absolute right-1 top-1 h-6 w-6" />
          </div>
          {uploading && <p className="text-xs text-muted-foreground">Uploading pasted file...</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving || uploading}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setBody(comment.body); setEditing(false); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <CommentBody body={comment.body} />
      )}
    </div>
  );
}

/* ---------- Attachments ---------- */

function fileIcon(mime: string | null) {
  if (!mime) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mime.startsWith("image/")) return <FileImage className="h-4 w-4 text-blue-500" />;
  if (mime === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function isPreviewable(mime: string | null) {
  if (!mime) return false;
  return mime.startsWith("image/") || mime === "application/pdf";
}

function AttachmentPreview({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const url = `/api/attachment-download/${file.id}`;
  const isImage = file.mime_type?.startsWith("image/");
  const isPdf = file.mime_type === "application/pdf";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate pr-8">
            {fileIcon(file.mime_type)}
            <span className="truncate">{file.file_name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center">
          {isImage && (
            <img
              src={url}
              alt={file.file_name}
              className="max-h-[70vh] max-w-full rounded-md object-contain"
            />
          )}
          {isPdf && (
            <iframe
              src={url}
              title={file.file_name}
              className="h-[70vh] w-full rounded-md border border-border"
            />
          )}
          <div className="mt-4 flex gap-2">
            <a href={url} download={file.file_name}>
              <Button size="sm" variant="outline">
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
              </Button>
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Attachments({ planId }: { planId: string }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);

  const { data: files = [] } = useQuery({
    queryKey: ["attachments", planId],
    queryFn: async (): Promise<Attachment[]> => {
      const data = await getBootstrapData();
      return (data.attachments as Attachment[])
        .filter((a) => a.plan_id === planId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
  });

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["attachments", planId] });
  };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await fileToBase64(file);
      const res = await fetch("/api/attachment-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, name: file.name, type: file.type, data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Upload failed ${res.status}`);
      const newAttachment: Attachment = json.data;
      qc.setQueryData(["attachments", planId], (old: Attachment[] = []) => [newAttachment, ...old]);
      clearBootstrapCache();
      toast.success("Uploaded");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <>
      {preview && <AttachmentPreview file={preview} onClose={() => setPreview(null)} />}
      <div className="rounded-xl border border-border p-4">
        <h3 className="mb-3 text-sm font-semibold">Evidence & attachments</h3>
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.id} className="group flex items-center gap-2 rounded-lg bg-secondary/60 p-2 text-sm">
              {fileIcon(f.mime_type)}
              <button
                className="flex-1 truncate text-left hover:underline"
                onClick={() => isPreviewable(f.mime_type) ? setPreview(f) : window.open(`/api/attachment-download/${f.id}`, "_blank")}
              >
                {f.file_name}
              </button>
              {isPreviewable(f.mime_type) && (
                <button onClick={() => setPreview(f)} title="Preview" className="text-muted-foreground hover:text-foreground">
                  <Eye className="h-4 w-4" />
                </button>
              )}
              <a href={`/api/attachment-download/${f.id}`} download={f.file_name} title="Download" className="text-muted-foreground hover:text-foreground">
                <Download className="h-4 w-4" />
              </a>
              <button
                title="Delete"
                onClick={async () => {
                  try {
                    await apiDelete(`attachments/${f.id}`);
                    invalidate();
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
          {files.length === 0 && <p className="text-xs text-muted-foreground">No files yet.</p>}
        </div>
        <div className="mt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary">
            <Paperclip className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload file"}
            <input type="file" className="hidden" onChange={onFile} disabled={uploading} />
          </label>
        </div>
      </div>
    </>
  );
}
