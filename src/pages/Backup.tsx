import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Download, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { clearBootstrapCache } from "@/lib/bootstrap";
import { setupApi } from "@/lib/setup";
import { useQueryClient } from "@tanstack/react-query";

export default function Backup() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetting, setResetting] = useState(false);
  const navigate = useNavigate();

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `auditrack-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const resetAll = async () => {
    setResetting(true);
    try {
      await setupApi.reset();
      clearBootstrapCache();
      await qc.invalidateQueries();
      toast.success("All data deleted");
      navigate("/setup");
    } catch (e) {
      toast.error((e as Error).message);
      setResetting(false);
    }
  };

  const onFileChange =(e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    e.target.value = "";
  };

  const restore = async () => {
    if (!pendingFile) return;
    setRestoring(true);
    try {
      const text = await pendingFile.text();
      const body = JSON.parse(text);
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error ?? "Restore failed");
      clearBootstrapCache();
      qc.invalidateQueries();
      toast.success("Database restored successfully");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(false);
      setPendingFile(null);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Backup & Restore</h1>
        <p className="text-sm text-muted-foreground">
          Export all data to a JSON file, or restore from a previous backup.
        </p>
      </header>

      <Card className="p-6 space-y-3">
        <div>
          <h2 className="font-medium">Download backup</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Downloads all database contents as a single JSON file. Attachment files are not included.
          </p>
        </div>
        <Button onClick={download} disabled={downloading}>
          {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Download backup
        </Button>
      </Card>

      <Card className="p-6 space-y-3">
        <div>
          <h2 className="font-medium">Restore from backup</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Restoring will <span className="font-semibold text-destructive">erase all current data</span> and
            replace it with the contents of the backup file.
          </p>
        </div>
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={restoring}>
          <Upload className="mr-2 h-4 w-4" />
          Select backup file…
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFileChange} />
      </Card>

      <Card className="p-6 space-y-3 border-destructive/40">
        <div>
          <h2 className="font-medium">Delete all data</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Permanently deletes every client, control, finding, plan, solution, note and attachment, then opens the
            setup again. Use this to remove demo data. Download a backup first if you might need anything back.
          </p>
        </div>
        <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setResetOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete all data…
        </Button>
      </Card>

      <AlertDialog open={resetOpen} onOpenChange={(o) => { if (!o && !resetting) { setResetOpen(false); setResetText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all data?</AlertDialogTitle>
            <AlertDialogDescription>
              This <strong>permanently deletes all data</strong> in this audiTrack database. This cannot be undone.
              Type <strong>DELETE</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); resetAll(); }}
              disabled={resetting || resetText !== "DELETE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingFile} onOpenChange={(o) => !o && setPendingFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore database?</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>permanently delete all current data</strong> and replace it with the
              contents of <strong>{pendingFile?.name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={restore}
              disabled={restoring}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {restoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Yes, restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
