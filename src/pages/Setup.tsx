import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Building2, CheckCircle2, Circle, Database, Library, Loader2, Plus, Sparkles, Trash2, Wand2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { clearBootstrapCache } from "@/lib/bootstrap";
import {
  setupApi, useSetupStatus, useSetupTemplates,
  type ControlSet, type PlanControl, type PlanSolution, type SetupCounts, type SetupPlan, type SetupTemplates,
} from "@/lib/setup";

// ---------- Draft model shared by the wizard and the AI review ----------

type DraftClient = { key: string; name: string; description: string; locations: string };
type DraftControl = PlanControl & { include: boolean };
type DraftSolution = PlanSolution & { include: boolean };
type Draft = { clients: DraftClient[]; controls: DraftControl[]; solutions: DraftSolution[] };

const newKey = () => Math.random().toString(36).slice(2, 10);
const emptyClient = (): DraftClient => ({ key: newKey(), name: "", description: "", locations: "" });

/** preselect: tick the essential baseline controls (for a new, empty database). */
function draftFromTemplates(t: SetupTemplates, preselect: boolean): Draft {
  return {
    clients: [emptyClient()],
    controls: t.controlSets.flatMap((s) =>
      s.controls.map(({ essential, ...c }) => ({ ...c, source: "template" as const, include: preselect && !!essential }))
    ),
    solutions: t.solutions.map((s) => ({ ...s, source: "template" as const, include: false })),
  };
}

function draftFromPlan(plan: SetupPlan): Draft {
  return {
    clients: plan.clients.length
      ? plan.clients.map((c) => ({ key: newKey(), name: c.name, description: c.description ?? "", locations: c.locations.join(", ") }))
      : [emptyClient()],
    controls: plan.controls.map((c) => ({ ...c, include: true })),
    solutions: plan.solutions.map((s) => ({ ...s, include: true })),
  };
}

function planFromDraft(d: Draft): SetupPlan {
  return {
    clients: d.clients
      .filter((c) => c.name.trim())
      .map((c) => ({
        name: c.name.trim(),
        description: c.description.trim() || null,
        locations: c.locations.split(/[,\n]/).map((l) => l.trim()).filter(Boolean),
      })),
    controls: d.controls.filter((c) => c.include).map(({ include: _i, ...c }) => c),
    solutions: d.solutions.filter((s) => s.include).map(({ include: _i, ...s }) => s),
  };
}

const plainText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function countsMessage(c: SetupCounts) {
  const parts = [
    [c.clients, "client"], [c.locations, "location"], [c.controls, "control"], [c.solutions, "solution"],
    [c.findings, "finding"], [c.remediation_plans, "remediation plan"],
  ] as const;
  return parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}${n === 1 ? "" : "s"}`).join(", ") || "nothing new";
}

// ---------- Page ----------

type Mode = "choose" | "wizard" | "ai";

export default function Setup() {
  // /setup?start=controls (from the Controls page) opens the wizard at the Controls step.
  const [searchParams] = useSearchParams();
  const startAtControls = searchParams.get("start") === "controls";
  const [mode, setMode] = useState<Mode>(startAtControls ? "wizard" : "choose");
  const { data: status, isLoading } = useSetupStatus();
  const { data: templates } = useSetupTemplates();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const finish = async (counts?: SetupCounts) => {
    await setupApi.complete(false);
    clearBootstrapCache();
    await qc.invalidateQueries();
    if (counts) toast.success(`${startAtControls ? "Added" : "Setup complete"}: ${countsMessage(counts)}`);
    navigate(startAtControls ? "/controls" : "/");
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" className="h-10 w-10" alt="" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Set up audiTrack</h1>
              <p className="text-sm text-muted-foreground">Fill an empty database with your clients, controls and solutions.</p>
            </div>
          </div>
          {status?.completed && (
            <Button variant="ghost" asChild>
              <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to the app</Link>
            </Button>
          )}
        </header>

        {isLoading || !templates ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : mode === "wizard" ? (
          <Wizard
            templates={templates}
            preselect={status?.empty ?? true}
            initialStep={startAtControls ? 1 : 0}
            onCancel={() => setMode("choose")}
            onDone={finish}
          />
        ) : mode === "ai" ? (
          <AiSetup templates={templates} onCancel={() => setMode("choose")} onDone={finish} />
        ) : (
          <Choose
            empty={status?.empty ?? true}
            aiAvailable={status?.aiAvailable ?? false}
            aiProvider={status?.aiProvider ?? null}
            completed={status?.completed ?? false}
            onWizard={() => setMode("wizard")}
            onAi={() => setMode("ai")}
            onDemo={async () => {
              const counts = await setupApi.demo();
              clearBootstrapCache();
              await qc.invalidateQueries();
              toast.success(`Demo data loaded: ${countsMessage(counts)}`);
              navigate("/");
            }}
            onSkip={async () => {
              await setupApi.complete(true);
              await qc.invalidateQueries({ queryKey: ["setup-status"] });
              navigate("/");
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Choose a path ----------

function Choose(props: {
  empty: boolean; aiAvailable: boolean; aiProvider: string | null; completed: boolean;
  onWizard: () => void; onAi: () => void; onDemo: () => Promise<void>; onSkip: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"demo" | "skip" | null>(null);
  const run = (which: "demo" | "skip", fn: () => Promise<void>) => async () => {
    setBusy(which);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm">
        {props.empty
          ? "Your database is empty. Choose how you want to start. Everything you add here can be changed later in the app."
          : "Your database already contains data. You can still add controls and solutions from the templates."}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <PathCard
          icon={Wand2}
          title="Step by step"
          text="Add your clients and locations, then pick controls and solutions from ready-made templates."
        >
          <Button onClick={props.onWizard}>Start wizard</Button>
        </PathCard>
        <PathCard
          icon={Sparkles}
          title="With AI"
          text="Describe your audit work in your own words. The AI proposes clients, controls and solutions; you review everything before it is saved."
        >
          <Button onClick={props.onAi} disabled={!props.aiAvailable}>
            <Sparkles className="mr-2 h-4 w-4" />Describe my work
          </Button>
          {props.aiProvider ? (
            <p className="text-xs text-muted-foreground">Uses {props.aiProvider}.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Not available: configure an AI provider (Anthropic, OpenAI, Azure OpenAI, OpenRouter or Ollama) in <code>.env</code>.
            </p>
          )}
        </PathCard>
        <PathCard
          icon={Database}
          title="Explore with demo data"
          text="Load a fictional data set: four clients, 28 findings, eight remediation plans, solutions and notes. Remove it later via Backup & Restore → Delete all data."
        >
          <Button variant="outline" onClick={run("demo", props.onDemo)} disabled={!props.empty || busy !== null}>
            {busy === "demo" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Load demo data
          </Button>
          {!props.empty && <p className="text-xs text-muted-foreground">Only possible on an empty database.</p>}
        </PathCard>
      </div>
      {!props.completed && (
        <Button variant="link" className="px-0 text-muted-foreground" onClick={run("skip", props.onSkip)} disabled={busy !== null}>
          Skip setup and start with an empty database
        </Button>
      )}
    </div>
  );
}

function PathCard({ icon: Icon, title, text, children }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon className="h-5 w-5" /></span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <p className="flex-1 text-sm text-muted-foreground">{text}</p>
      <div className="space-y-2">{children}</div>
    </Card>
  );
}

// ---------- Wizard ----------

const STEPS = [
  { id: "clients", title: "Clients & locations", icon: Building2 },
  { id: "controls", title: "Controls", icon: Library },
  { id: "solutions", title: "Solutions", icon: BookOpen },
  { id: "review", title: "Review", icon: CheckCircle2 },
] as const;

function Wizard({ templates, preselect, initialStep = 0, onCancel, onDone }: {
  templates: SetupTemplates; preselect: boolean; initialStep?: number; onCancel: () => void; onDone: (c: SetupCounts) => Promise<void>;
}) {
  const [step, setStep] = useState(initialStep);
  const [draft, setDraft] = useState<Draft>(() => draftFromTemplates(templates, preselect));
  const solutionsSuggested = useRef(false);

  const goTo = (i: number) => {
    // First time on the solutions step: pre-select solutions for the chosen controls.
    if (STEPS[i].id === "solutions" && !solutionsSuggested.current) {
      solutionsSuggested.current = true;
      const chosen = new Set(draft.controls.filter((c) => c.include && c.code).map((c) => c.code));
      setDraft((d) => ({ ...d, solutions: d.solutions.map((s) => ({ ...s, include: s.include || s.controls.some((c) => chosen.has(c)) })) }));
    }
    setStep(i);
  };
  const id = STEPS[step].id;

  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <nav aria-label="Setup steps">
        <ol className="space-y-1">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => goTo(i)}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", i === step && "bg-muted font-semibold")}
              >
                {i < step ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                {s.title}
              </button>
            </li>
          ))}
        </ol>
        <Button variant="ghost" size="sm" className="mt-4" onClick={onCancel}><ArrowLeft className="mr-2 h-4 w-4" />Other options</Button>
      </nav>

      <Card className="space-y-5 p-5">
        <div>
          <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
          <h2 className="text-lg font-semibold">{STEPS[step].title}</h2>
        </div>
        {id === "clients" && <ClientsEditor clients={draft.clients} onChange={(clients) => setDraft({ ...draft, clients })} />}
        {id === "controls" && <ControlsPicker templates={templates} controls={draft.controls} onChange={(controls) => setDraft({ ...draft, controls })} />}
        {id === "solutions" && <SolutionsPicker solutions={draft.solutions} controls={draft.controls} onChange={(solutions) => setDraft({ ...draft, solutions })} />}
        {id === "review" && <ReviewAndApply draft={draft} onEdit={(i) => goTo(i)} onDone={onDone} />}
        {id !== "review" && (
          <div className="flex justify-between border-t pt-4">
            <Button variant="ghost" onClick={() => (step === 0 ? onCancel() : goTo(step - 1))}>Back</Button>
            <Button onClick={() => goTo(step + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function ReviewAndApply({ draft, onEdit, onDone, viaAi = false }: { draft: Draft; onEdit?: (step: number) => void; onDone: (c: SetupCounts) => Promise<void>; viaAi?: boolean }) {
  const [saving, setSaving] = useState(false);
  const plan = planFromDraft(draft);
  const rows = [
    { label: "Clients", n: plan.clients.length, step: 0 },
    { label: "Locations", n: plan.clients.reduce((a, c) => a + c.locations.length, 0), step: 0 },
    { label: "Controls", n: plan.controls.length, step: 1 },
    { label: "Solutions", n: plan.solutions.length, step: 2 },
  ];
  const apply = async () => {
    setSaving(true);
    try {
      const counts = await (viaAi ? setupApi.applyAi(plan) : setupApi.apply(plan));
      await onDone(counts);
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  };
  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="py-2">{r.label}</td>
              <td className="text-right font-mono">{r.n}</td>
              {onEdit && <td className="w-20 pl-3 text-right"><Button size="sm" variant="ghost" onClick={() => onEdit(r.step)}>Edit</Button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-muted-foreground">
        Nothing has been saved yet. Records that already exist (same client name, control code or solution code) are skipped.
      </p>
      <div className="flex justify-end">
        <Button onClick={apply} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save and finish setup
        </Button>
      </div>
    </div>
  );
}

// ---------- Editors ----------

function ClientsEditor({ clients, onChange }: { clients: DraftClient[]; onChange: (c: DraftClient[]) => void }) {
  const update = (key: string, patch: Partial<DraftClient>) => onChange(clients.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A client is an organisation you audit. Locations can be sites, departments, business units or environments. You can skip this and add clients later.
      </p>
      {clients.map((c, i) => (
        <div key={c.key} className="space-y-2 rounded-lg border p-3">
          <div className="flex gap-2">
            <Input aria-label={`Client ${i + 1} name`} placeholder="Client name" value={c.name} onChange={(e) => update(c.key, { name: e.target.value })} />
            <Button variant="ghost" size="icon" aria-label="Remove client" onClick={() => onChange(clients.filter((x) => x.key !== c.key))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Input aria-label={`Client ${i + 1} description`} placeholder="Description (optional)" value={c.description} onChange={(e) => update(c.key, { description: e.target.value })} />
          <Input aria-label={`Client ${i + 1} locations`} placeholder="Locations, separated by commas — e.g. Head office, Data centre" value={c.locations} onChange={(e) => update(c.key, { locations: e.target.value })} />
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...clients, emptyClient()])}><Plus className="mr-2 h-4 w-4" />Add client</Button>
    </div>
  );
}

function ControlsPicker({ templates, controls, onChange }: { templates: SetupTemplates; controls: DraftControl[]; onChange: (c: DraftControl[]) => void }) {
  const [own, setOwn] = useState({ code: "", name: "" });
  const [openFramework, setOpenFramework] = useState<string | null>(null);
  const sets = templates.controlSets;

  // Template code -> its set and whether it is essential.
  const index = useMemo(() => {
    const m = new Map<string, { set: ControlSet; essential: boolean }>();
    for (const s of sets) for (const c of s.controls) m.set(c.code, { set: s, essential: !!c.essential });
    return m;
  }, [sets]);
  const isTemplate = (c: DraftControl) => c.source === "template" && !!c.code && index.has(c.code);
  const inSet = (s: ControlSet) => controls.filter((c) => isTemplate(c) && index.get(c.code as string)?.set.id === s.id);

  const toggle = (target: DraftControl[], include: boolean) => {
    const keys = new Set(target);
    onChange(controls.map((c) => (keys.has(c) ? { ...c, include } : c)));
  };

  const baseline = sets.filter((s) => s.kind === "baseline").map((set) => ({ set, items: inSet(set) })).filter((g) => g.items.length);
  const baselineItems = baseline.flatMap((g) => g.items);
  const frameworks = templates.frameworks
    .map((f) => ({ f, themes: sets.filter((s) => s.framework === f.id).map((set) => ({ set, items: inSet(set) })).filter((t) => t.items.length) }))
    .filter((x) => x.themes.length);
  const others = [
    { name: "Proposed by AI", items: controls.filter((c) => !isTemplate(c) && c.source === "ai") },
    { name: "Your own controls", items: controls.filter((c) => !isTemplate(c) && c.source !== "ai") },
  ].filter((g) => g.items.length);
  const selected = controls.filter((c) => c.include).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Controls are the requirements you audit against. Start from the recommended baseline, add a complete framework, or both.
        Descriptions can be edited later. <span className="font-medium text-foreground">{selected} selected.</span>
      </p>

      {baseline.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-semibold">Recommended baseline</h3>
              <p className="text-xs text-muted-foreground">
                Based on the CIS Controls v8, grouped by NIST CSF 2.0 function, with references to ISO 27001. Controls marked <em>Essential</em> cover basic security hygiene.
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => onChange(controls.map((c) => (baselineItems.includes(c) ? { ...c, include: !!index.get(c.code as string)?.essential } : c)))}>Essential only</Button>
              <Button size="sm" variant="ghost" onClick={() => toggle(baselineItems, true)}>All</Button>
              <Button size="sm" variant="ghost" onClick={() => toggle(baselineItems, false)}>None</Button>
            </div>
          </div>
          {baseline.map(({ set, items }) => (
            <ControlGroup key={set.id} title={set.name} subtitle={set.description} items={items} essential={(c) => !!index.get(c.code as string)?.essential} onToggle={toggle} />
          ))}
        </section>
      )}

      {frameworks.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="font-semibold">Frameworks</h3>
            <p className="text-xs text-muted-foreground">Add every control of a framework in one go. You can still untick individual controls.</p>
          </div>
          {frameworks.map(({ f, themes }) => {
            const items = themes.flatMap((t) => t.items);
            const count = items.filter((c) => c.include).length;
            const all = count === items.length;
            const open = openFramework === f.id;
            return (
              <Card key={f.id} className={cn("space-y-3 p-4", count > 0 && "border-primary/50")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{f.name}</h4>
                      <Badge variant={count ? "default" : "outline"}>{count} of {items.length} selected</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{f.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant={all ? "outline" : "default"} onClick={() => toggle(items, !all)}>
                      {all ? "Remove all" : <><Plus className="mr-1 h-4 w-4" />Add all {items.length} controls</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenFramework(open ? null : f.id)}>{open ? "Hide controls" : "Show controls"}</Button>
                  </div>
                </div>
                {open && themes.map(({ set, items: themeItems }) => (
                  <ControlGroup key={set.id} title={set.name} items={themeItems} onToggle={toggle} />
                ))}
              </Card>
            );
          })}
        </section>
      )}

      {others.map((g) => (
        <ControlGroup key={g.name} title={g.name} items={g.items} onToggle={toggle} />
      ))}

      <form
        className="flex flex-wrap gap-2 rounded-lg border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!own.name.trim()) return;
          onChange([...controls, { code: own.code.trim() || null, name: own.name.trim(), description: null, source: "own", include: true }]);
          setOwn({ code: "", name: "" });
        }}
      >
        <Input className="w-28" aria-label="Own control code" placeholder="Code" value={own.code} onChange={(e) => setOwn({ ...own, code: e.target.value })} />
        <Input className="min-w-48 flex-1" aria-label="Own control name" placeholder="Add your own control" value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} />
        <Button type="submit" variant="outline"><Plus className="mr-2 h-4 w-4" />Add</Button>
      </form>
    </div>
  );
}

function ControlGroup({ title, subtitle, items, essential, onToggle }: {
  title: string; subtitle?: string; items: DraftControl[];
  essential?: (c: DraftControl) => boolean; onToggle: (items: DraftControl[], include: boolean) => void;
}) {
  const count = items.filter((c) => c.include).length;
  const all = count === items.length;
  return (
    <section className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">· {count}/{items.length}</span></h4>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => onToggle(items, !all)}>{all ? "Select none" : "Select all"}</Button>
      </div>
      <ul className="divide-y">
        {items.map((c, i) => (
          <li key={`${c.code ?? ""}-${c.name}-${i}`}>
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/40">
              <Checkbox className="mt-0.5" checked={c.include} onCheckedChange={(v) => onToggle([c], v === true)} />
              <span className="min-w-0 text-sm">
                <span className="flex flex-wrap items-center gap-x-2 font-medium">
                  {c.code && <span className="font-mono text-xs text-muted-foreground">{c.code}</span>}
                  {c.name}
                  {essential?.(c) && <Badge variant="secondary" className="text-[10px]">Essential</Badge>}
                </span>
                {c.description && <span className="block truncate text-xs text-muted-foreground">{c.description.split("\n")[0]}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SolutionsPicker({ solutions, controls, onChange }: { solutions: DraftSolution[]; controls: DraftControl[]; onChange: (s: DraftSolution[]) => void }) {
  const chosen = new Set(controls.filter((c) => c.include && c.code).map((c) => c.code as string));
  const relevant = (s: DraftSolution) => s.controls.some((c) => chosen.has(c));
  const sorted = [...solutions].sort((a, b) => Number(relevant(b)) - Number(relevant(a)));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Solutions are reusable remediation guidance, linked to controls. Solutions for your selected controls are listed first.
      </p>
      <ul className="divide-y rounded-lg border">
        {sorted.map((s, i) => (
          <li key={`${s.code ?? ""}-${s.title}-${i}`}>
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/40">
              <Checkbox className="mt-0.5" checked={s.include} onCheckedChange={(v) => onChange(solutions.map((x) => (x === s ? { ...x, include: v === true } : x)))} />
              <span className="min-w-0 space-y-1 text-sm">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {s.title}
                  {s.source === "ai" && <Badge variant="secondary">AI</Badge>}
                </span>
                <span className="line-clamp-2 block text-xs text-muted-foreground">{plainText(s.body)}</span>
                <span className="flex flex-wrap gap-1">
                  {s.controls.map((c) => (
                    <Badge key={c} variant={chosen.has(c) ? "default" : "outline"} className="font-mono text-[10px]">{c}</Badge>
                  ))}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- AI ----------

const AI_EXAMPLE =
  "We are a three-person audit team doing yearly ISO 27001 and NIS2 audits for two clients: a logistics company with a head office and two warehouses, and a regional hospital with a main site and an outpatient clinic. We focus on access management, backups, patching and supplier security.";

function AiSetup({ templates, onCancel, onDone }: { templates: SetupTemplates; onCancel: () => void; onDone: (c: SetupCounts) => Promise<void> }) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const proposal = await setupApi.ai(description);
      setSummary(proposal.summary);
      setDraft(draftFromPlan(proposal.plan));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!draft) {
    return (
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Describe your audit work</h2>
          <p className="text-sm text-muted-foreground">
            Which clients and locations do you audit, which frameworks or standards do you use, and what do you focus on? The AI only makes a proposal; nothing is saved until you approve it.
          </p>
        </div>
        <Textarea rows={7} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={AI_EXAMPLE} aria-label="Description of your audit work" />
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}><ArrowLeft className="mr-2 h-4 w-4" />Other options</Button>
            {!description && <Button variant="outline" onClick={() => setDescription(AI_EXAMPLE)}>Use example</Button>}
          </div>
          <Button onClick={generate} disabled={loading || description.trim().length < 20}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {loading ? "Thinking… (this can take a minute)" : "Make a proposal"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-2 border-primary/30 bg-primary-soft p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" />AI proposal — review before saving</h2>
        {summary && <p className="text-sm">{summary}</p>}
        <p className="text-xs text-muted-foreground">Edit the clients, untick anything you don't want, then save. Items marked AI were written by the AI rather than taken from the templates.</p>
      </Card>
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Clients & locations</h3>
        <ClientsEditor clients={draft.clients} onChange={(clients) => setDraft({ ...draft, clients })} />
      </Card>
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Controls</h3>
        <ControlsPicker templates={templates} controls={draft.controls} onChange={(controls) => setDraft({ ...draft, controls })} />
      </Card>
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Solutions</h3>
        <SolutionsPicker solutions={draft.solutions} controls={draft.controls} onChange={(solutions) => setDraft({ ...draft, solutions })} />
      </Card>
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Save</h3>
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Start over</Button>
        </div>
        <ReviewAndApply draft={draft} onDone={onDone} viaAi />
      </Card>
    </div>
  );
}
