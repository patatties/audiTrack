import React, { Component, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor, RichTextView } from "@/components/RichTextEditor";
import { Plus, Search, Tag, Trash2, BookOpen, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getBootstrapData, clearBootstrapCache } from "@/lib/bootstrap";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";

export interface Solution {
  id: string;
  code: string | null;
  title: string;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

class SolutionsErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-destructive p-6 space-y-2">
          <p className="font-semibold text-destructive text-sm">Solutions failed to render</p>
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{this.state.error.message}</pre>
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground opacity-60">{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function SolutionsInner() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: solutions = [], isLoading } = useQuery({
    queryKey: ["solutions"],
    queryFn: async (): Promise<Solution[]> => {
      const data = await getBootstrapData();
      return (data.solutions as Solution[]).sort((a, b) =>
        (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
      );
    },
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    solutions.forEach((sol) => {
      const tags = Array.isArray(sol.tags) ? sol.tags : [];
      tags.forEach((t) => s.add(t));
    });
    return Array.from(s).sort();
  }, [solutions]);

  const filtered = useMemo(() => {
    return solutions
      .filter((s) => {
        const tags = Array.isArray(s.tags) ? s.tags : [];
        if (activeTag && !tags.includes(activeTag)) return false;
        if (query) {
          const q = query.toLowerCase();
          const text = `${s.code ?? ""} ${s.title ?? ""} ${s.body ?? ""} ${tags.join(" ")}`.toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ac = a.code ?? "";
        const bc = b.code ?? "";
        if (ac && bc) return ac.localeCompare(bc, undefined, { numeric: true });
        if (ac) return -1;
        if (bc) return 1;
        return (a.title ?? "").localeCompare(b.title ?? "");
      });
  }, [solutions, query, activeTag]);

  const create = useMutation({
    mutationFn: async () => {
      const data = await getBootstrapData();
      const existing = data.solutions as { code: string | null }[];
      const max = existing.reduce((acc, r) => {
        const m = r.code?.match(/^SOL-(\d+)$/);
        const n = m ? parseInt(m[1], 10) : 0;
        return n > acc ? n : acc;
      }, 0);
      const nextCode = `SOL-${String(max + 1).padStart(3, "0")}`;
      const res = await apiPost("solutions", { title: "Untitled solution", body: "", tags: [], code: nextCode });
      return res.data as Solution;
    },
    onSuccess: (sol) => {
      clearBootstrapCache();
      qc.invalidateQueries({ queryKey: ["solutions"] });
      setCreating(false);
      setOpenId(sol.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Solutions</h1>
          <p className="text-sm text-muted-foreground">
            Documented implementations you can reference from controls and findings.
          </p>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="mr-1.5 h-4 w-4" /> New solution
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search solutions..."
            className="pl-8"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTag(activeTag === t ? null : t)}
                className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  activeTag === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
                }`}
              >
                {t}
              </button>
            ))}
            {activeTag && (
              <button onClick={() => setActiveTag(null)} className="text-xs text-muted-foreground hover:text-foreground">
                clear
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {solutions.length === 0
              ? "No solutions yet. Create your first one to start documenting implementations."
              : "No solutions match your filters."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenId(s.id)}
              className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/40"
            >
              <div className="flex items-start gap-2">
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {s.code && <Badge variant="outline" className="font-mono text-[10px]">{s.code}</Badge>}
                    <h3 className="truncate font-medium">{s.title || "Untitled"}</h3>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {stripHtml(s.body) || "No content yet."}
                  </p>
                  {(Array.isArray(s.tags) ? s.tags : []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(Array.isArray(s.tags) ? s.tags : []).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <SolutionDialog id={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}

export default function Solutions() {
  return (
    <SolutionsErrorBoundary>
      <SolutionsInner />
    </SolutionsErrorBoundary>
  );
}

function stripHtml(html: string | null | undefined) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function SolutionDialog({
  id,
  onOpenChange,
  detached = false,
}: {
  id: string | null;
  onOpenChange: (o: boolean) => void;
  detached?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const open = !!id;

  const { data: solution } = useQuery({
    queryKey: ["solution", id],
    enabled: !!id,
    queryFn: async (): Promise<Solution | null> => {
      if (!id) return null;
      const data = await getBootstrapData();
      return (data.solutions as Solution[]).find((s) => s.id === id) ?? null;
    },
  });

  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (solution) {
      setTitle(solution.title);
      setCode(solution.code ?? "");
      setBody(solution.body ?? "");
      setTags(Array.isArray(solution.tags) ? solution.tags : []);
    }
  }, [solution?.id]);

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["solutions"] });
    qc.invalidateQueries({ queryKey: ["solution", id] });
  };

  function handleClose() {
    if (detached) navigate(-1);
    else onOpenChange(false);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!id) return;
      await apiPatch(`solutions/${id}`, { title: title.trim() || "Untitled", body, tags });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!id) return;
      await apiDelete(`solutions/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Deleted");
      if (detached) navigate("/solutions");
      else onOpenChange(false);
    },
  });

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  const codeEl = code ? (
    detached ? (
      <span className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 font-mono text-xs text-muted-foreground">
        {code}
      </span>
    ) : (
      <Link
        to={`/solutions/${id}`}
        className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground"
        title="Open in full page"
      >
        {code}
      </Link>
    )
  ) : null;

  const actionButtons = solution ? (
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
            <AlertDialogTitle>Delete this solution?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!detached && <Button variant="ghost" size="sm" onClick={handleClose}>Close</Button>}
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  ) : null;

  const formContent = !solution ? (
    <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
  ) : (
    <div className="space-y-4">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="text-lg font-semibold"
      />
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              <button onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addTag(); }
              if (e.key === "Backspace" && !tagInput && tags.length) setTags(tags.slice(0, -1));
            }}
            placeholder="Add tag..."
            className="h-7 w-32 text-xs"
          />
        </div>
      </div>
      <RichTextEditor value={body} onChange={setBody} placeholder="Document the solution..." />
    </div>
  );

  if (detached) {
    return (
      <div>
        <div className="sticky top-0 z-10 border-b border-border bg-background px-6 pb-3 pt-6">
          <div className="mx-auto max-w-4xl flex items-center justify-between gap-3">
            <h1 className="flex items-center gap-3 text-lg font-semibold leading-none tracking-tight">
              Solution
              {codeEl}
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
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-border bg-background px-6 pb-3 pt-6">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-3">
              Solution
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
