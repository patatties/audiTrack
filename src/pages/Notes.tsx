import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { TranslateButton } from "@/components/TranslateButton";
import { formatDistanceToNow } from "date-fns";
import { getBootstrapData, clearBootstrapCache } from "@/lib/bootstrap";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";

interface Note {
  id: string;
  title: string | null;
  body: string;
  processed: boolean;
  created_at: string;
  updated_at: string;
}

export default function Notes() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [showProcessed, setShowProcessed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const startEdit = (n: Note) => {
    setEditingId(n.id);
    setEditTitle(n.title ?? "");
    setEditBody(n.body);
  };

  const cancelEdit = () => setEditingId(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes", showProcessed],
    queryFn: async () => {
      const data = await getBootstrapData();
      const all = data.notes as Note[];
      return showProcessed ? all : all.filter((n) => !n.processed);
    },
  });

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["notes"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!body.trim()) throw new Error("Write something first");
      await apiPost("notes", { title: title.trim() || null, body: body.trim() });
    },
    onSuccess: () => {
      invalidate();
      setTitle(""); setBody("");
      toast.success("Note saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Note> }) => {
      await apiPatch(`notes/${input.id}`, input.patch);
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdit = (id: string) => {
    if (!editBody.trim()) { toast.error("Body cannot be empty"); return; }
    update.mutate({ id, patch: { title: editTitle.trim() || null, body: editBody.trim() } });
    setEditingId(null);
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiDelete(`notes/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Note deleted");
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="text-sm text-muted-foreground">
            Quickly dump knowledge here, then process each note into findings or controls.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowProcessed((v) => !v)}>
          {showProcessed ? "Hide processed" : "Show processed"}
        </Button>
      </header>

      <Card className="p-4 space-y-3">
        <div className="relative">
          <Input
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="pr-8"
          />
          <TranslateButton value={title} onChange={setTitle}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" />
        </div>
        <div className="relative">
          <Textarea
            rows={4}
            placeholder="Dump your thoughts, observations, or raw notes…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") create.mutate();
            }}
            className="pr-8"
          />
          <TranslateButton value={body} onChange={setBody}
            className="absolute right-1 top-1 h-6 w-6" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Tip: ⌘/Ctrl + Enter to save</span>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-1.5 h-4 w-4" /> Add note
          </Button>
        </div>
      </Card>

      <div className="grid gap-3">
        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && notes.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No notes yet. Drop a thought above.
          </div>
        )}
        {notes.map((n) => {
          const isEditing = editingId === n.id;
          return (
            <Card key={n.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Input
                          placeholder="Title (optional)"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="pr-8"
                        />
                        <TranslateButton value={editTitle} onChange={setEditTitle}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" />
                      </div>
                      <div className="relative">
                        <Textarea
                          rows={4}
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveEdit(n.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                          className="pr-8"
                        />
                        <TranslateButton value={editBody} onChange={setEditBody}
                          className="absolute right-1 top-1 h-6 w-6" />
                      </div>
                      <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter to save · Esc to cancel</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        {n.title ? (
                          <h3 className="truncate font-medium">{n.title}</h3>
                        ) : (
                          <h3 className="truncate text-muted-foreground">Untitled</h3>
                        )}
                        {n.processed && <Badge variant="secondary">Processed</Badge>}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{n.body}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : "just now"}</span>
                        <Link
                          to={`/notes/${n.id}`}
                          className="flex items-center gap-1 hover:text-foreground"
                          title="Open in full page"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span className="font-mono">#{n.id.slice(0, 8)}</span>
                        </Link>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {isEditing ? (
                    <>
                      <Button size="sm" variant="default" onClick={() => saveEdit(n.id)} disabled={update.isPending}>
                        <Check className="mr-1.5 h-3.5 w-3.5" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>
                        <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(n)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update.mutate({ id: n.id, patch: { processed: !n.processed } })}
                      >
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        {n.processed ? "Unmark" : "Mark done"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove.mutate(n.id)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
