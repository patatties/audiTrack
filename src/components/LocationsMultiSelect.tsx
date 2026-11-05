import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useClients, useLocations } from "@/lib/queries";

export default function LocationsMultiSelect({
  value,
  onChange,
  placeholder = "Select client locations...",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const { data: clients = [] } = useClients();
  const { data: locations = [] } = useLocations();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const grouped = useMemo(() => {
    const byClient = new Map<string, { id: string; name: string }[]>();
    for (const l of locations) {
      const arr = byClient.get(l.client_id) ?? [];
      arr.push({ id: l.id, name: l.name });
      byClient.set(l.client_id, arr);
    }
    return clients
      .map((c) => ({ client: c, locations: byClient.get(c.id) ?? [] }))
      .filter((g) => g.locations.length > 0);
  }, [clients, locations]);

  const filtered = useMemo(() => {
    if (!q.trim()) return grouped;
    const needle = q.toLowerCase();
    return grouped
      .map((g) => ({
        client: g.client,
        locations: g.locations.filter(
          (l) =>
            l.name.toLowerCase().includes(needle) ||
            g.client.name.toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.locations.length > 0);
  }, [grouped, q]);

  const labelFor = (id: string) => {
    const loc = locations.find((l) => l.id === id);
    if (!loc) return "—";
    const client = clients.find((c) => c.id === loc.client_id);
    return `${client?.name ?? "?"} · ${loc.name}`;
  };

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const toggleClient = (clientId: string) => {
    const ids = (grouped.find((g) => g.client.id === clientId)?.locations ?? []).map((l) => l.id);
    const allSelected = ids.every((id) => value.includes(id));
    onChange(
      allSelected
        ? value.filter((v) => !ids.includes(v))
        : Array.from(new Set([...value, ...ids])),
    );
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
            <span className="truncate text-muted-foreground">
              {value.length === 0 ? placeholder : `${value.length} location(s) selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients or locations..."
              className="h-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto px-1 pb-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</p>
            ) : (
              filtered.map((g) => {
                const ids = g.locations.map((l) => l.id);
                const allSel = ids.every((id) => value.includes(id));
                const someSel = !allSel && ids.some((id) => value.includes(id));
                return (
                  <div key={g.client.id} className="mb-1">
                    <button
                      type="button"
                      onClick={() => toggleClient(g.client.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary"
                    >
                      <Checkbox checked={allSel ? true : someSel ? "indeterminate" : false} />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.client.name}
                      </span>
                    </button>
                    <div className="ml-5 space-y-0.5">
                      {g.locations.map((l) => {
                        const checked = value.includes(l.id);
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => toggle(l.id)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                          >
                            <Checkbox checked={checked} />
                            <span className="flex-1">{l.name}</span>
                            {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1">
              {labelFor(id)}
              <button
                type="button"
                onClick={() => toggle(id)}
                className="ml-0.5 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
