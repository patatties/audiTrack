import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { BookOpen, Plus, X } from "lucide-react";
import { SolutionDialog, type Solution } from "@/pages/Solutions";
import { getBootstrapData, clearBootstrapCache } from "@/lib/bootstrap";
import { apiPost, apiDelete } from "@/lib/api";

type LinkKind = "control" | "plan";

const API_ROUTE: Record<LinkKind, string> = {
  control: "solution-controls",
  plan: "solution-remediations",
};
const FK: Record<LinkKind, "control_id" | "plan_id"> = {
  control: "control_id",
  plan: "plan_id",
};
const DATA_KEY: Record<LinkKind, "solution_controls" | "solution_remediations"> = {
  control: "solution_controls",
  plan: "solution_remediations",
};

export function SolutionLinks({ kind, parentId }: { kind: LinkKind; parentId: string }) {
  const qc = useQueryClient();
  const fk = FK[kind];
  const apiRoute = API_ROUTE[kind];
  const dataKey = DATA_KEY[kind];
  const [openSolution, setOpenSolution] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: allSolutions = [] } = useQuery({
    queryKey: ["solutions"],
    queryFn: async (): Promise<Solution[]> => {
      const data = await getBootstrapData();
      return (data.solutions as Solution[]).sort((a, b) => a.title.localeCompare(b.title));
    },
  });

  const { data: linkedIds = [] } = useQuery({
    queryKey: ["solution-links", kind, parentId],
    queryFn: async (): Promise<string[]> => {
      const data = await getBootstrapData();
      const rows = data[dataKey] as { solution_id: string; control_id?: string; plan_id?: string }[];
      return rows
        .filter((r) => r[fk] === parentId)
        .map((r) => r.solution_id);
    },
  });

  const linked = useMemo(
    () => allSolutions.filter((s) => linkedIds.includes(s.id)),
    [allSolutions, linkedIds],
  );
  const available = useMemo(
    () => allSolutions.filter((s) => !linkedIds.includes(s.id)),
    [allSolutions, linkedIds],
  );

  const invalidate = () => {
    clearBootstrapCache();
    qc.invalidateQueries({ queryKey: ["solution-links", kind, parentId] });
    qc.invalidateQueries({ queryKey: ["solutions"] });
  };

  const attach = useMutation({
    mutationFn: async (solutionId: string) => {
      await apiPost(apiRoute, { solution_id: solutionId, [fk]: parentId });
    },
    onSuccess: invalidate,
  });

  const detach = useMutation({
    mutationFn: async (solutionId: string) => {
      await apiDelete(apiRoute, { solution_id: solutionId, [fk]: parentId });
    },
    onSuccess: invalidate,
  });

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Linked solutions</h3>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-3.5 w-3.5" /> Link solution
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <Command>
              <CommandInput placeholder="Search solutions..." />
              <CommandList>
                <CommandEmpty>No solutions found.</CommandEmpty>
                <CommandGroup>
                  {available.map((s) => (
                    <CommandItem
                      key={s.id}
                      onSelect={() => {
                        attach.mutate(s.id);
                        setPickerOpen(false);
                      }}
                    >
                      <BookOpen className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                      {s.code && <span className="mr-2 font-mono text-[10px] text-muted-foreground">{s.code}</span>}
                      <span className="flex-1 truncate">{s.title}</span>
                      {(Array.isArray(s.tags) ? s.tags : []).length > 0 && (
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          {(Array.isArray(s.tags) ? s.tags : []).slice(0, 2).join(", ")}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                  {available.length === 0 && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      All solutions are linked, or none exist yet.
                    </div>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">No solutions linked yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {linked.map((s) => (
            <li key={s.id} className="group flex items-center gap-2 rounded-md bg-secondary/50 px-2 py-1.5">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              {s.code && <Badge variant="outline" className="font-mono text-[10px]">{s.code}</Badge>}
              <button
                onClick={() => setOpenSolution(s.id)}
                className="flex-1 truncate text-left text-sm hover:text-primary"
              >
                {s.title}
              </button>
              {(Array.isArray(s.tags) ? s.tags : []).slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
              ))}
              <button
                onClick={() => detach.mutate(s.id)}
                className="opacity-0 group-hover:opacity-100"
                title="Unlink"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <SolutionDialog id={openSolution} onOpenChange={(o) => !o && setOpenSolution(null)} />
    </div>
  );
}
