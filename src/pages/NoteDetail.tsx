import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, Trash2 } from "lucide-react";
import { TranslateButton } from "@/components/TranslateButton";
import { formatDistanceToNow } from "date-fns";
import { getBootstrapData, clearBootstrapCache } from "@/lib/bootstrap";
import { apiPatch, apiDelete } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Note {
  id: string;
  title: string | null;
  body: string;
  processed: boolean;
  created_at: string;
  updated_at: string;
}

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: note, isLoading } = useQuery({
    queryKey: ["note", id],
    enabled: !!id,
    queryFn: async (): Promise<Note | null> => {
      if (!id) return null;
      const data = await getBootstrapData();
      return (data.notes as Note[]).find((n) => n.id === id) ?? null;
    },
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (note) { setTitle(note.title ?? ""); setBody(note.body); }
  }, [note?.id]);

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["notes"] });
    qc.invalidateQueries({ queryKey: ["note", id] });
  };

  const update = useMutation({
    mutationFn: async () => {
      if (!id || !body.trim()) throw new Error("Body cannot be empty");
      await apiPatch(`notes/${id}`, { title: title.trim() || null, body: body.trim() });
    },
    onSuccess: () => { invalidate(); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleProcessed = useMutation({
    mutationFn: async () => {
      if (!id || !note) return;
      await apiPatch(`notes/${id}`, { processed: !note.processed });
    },
    onSuccess: () => invalidate(),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!id) return;
      await apiDelete(`notes/${id}`);
    },
    onSuccess: () => { invalidate(); toast.success("Deleted"); navigate("/notes"); },
  });

  if (isLoading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
    );
  }

  if (!note) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">Note not found.</div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border bg-background px-6 pb-3 pt-6">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-lg font-semibold leading-none tracking-tight">
            Note
            <span className="font-mono text-xs font-normal text-muted-foreground">#{note.id.slice(0, 8)}</span>
            {note.processed && <Badge variant="secondary" className="text-xs">Processed</Badge>}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>← Back</Button>
            <Button size="sm" variant="outline" onClick={() => toggleProcessed.mutate()} disabled={toggleProcessed.isPending}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {note.processed ? "Unmark" : "Mark done"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending}>Save</Button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-6 py-6 space-y-4">
        <div className="text-xs text-muted-foreground">
          {note.created_at ? formatDistanceToNow(new Date(note.created_at), { addSuffix: true }) : ""}
        </div>
        <div className="relative">
          <Input
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="pr-8 text-lg font-medium"
          />
          <TranslateButton value={title} onChange={setTitle}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" />
        </div>
        <div className="relative">
          <Textarea
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") update.mutate();
            }}
            className="pr-8"
          />
          <TranslateButton value={body} onChange={setBody}
            className="absolute right-1 top-1 h-6 w-6" />
        </div>
        <p className="text-xs text-muted-foreground">⌘/Ctrl + Enter to save</p>
      </div>
    </div>
  );
}
