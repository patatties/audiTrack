import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2, MessageCircle, FileText, CheckCircle2, Plus } from "lucide-react";
import { apiPost } from "@/lib/api";
import { clearBootstrapCache, getBootstrapData } from "@/lib/bootstrap";
import { useClients, useLocations, useControls, useControlCatalog } from "@/lib/queries";
import { SEVERITIES, type FindingSeverity } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

/** A tool the assistant used through audiTrack's MCP server. */
type Action = { name: string; title: string; write: boolean; ok: boolean };
/** A change the assistant wants to make; it waits for approval. */
type Pending = { id: string; name: string; title: string; args: Record<string, unknown> };
type AssistantTurn = { chatId: string; reply: string; pending: Pending[]; actions: Action[] };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[] };

const argValue = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));

type SuggestionFinding = {
  title: string;
  description: string;
  severity: FindingSeverity;
  control_id: string | null;
  location_id: string | null;
};

type SuggestionRemediation = {
  title: string;
  description: string;
  effort_days: number | null;
  steps: string[];
  related_finding_titles: string[];
};

type Suggestions = {
  summary: string;
  findings: SuggestionFinding[];
  remediations: SuggestionRemediation[];
};

export default function AskAIDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const { data: locations = [] } = useLocations();
  const { data: controls = [] } = useControls();
  const { data: catalog = [] } = useControlCatalog();

  const [mode, setMode] = useState<"question" | "rant" | null>(null);

  // question mode
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // rant mode
  const [rant, setRant] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [addedFindings, setAddedFindings] = useState<Set<number>>(new Set());
  const [addedRemediations, setAddedRemediations] = useState<Set<number>>(new Set());
  const [findingOverrides, setFindingOverrides] = useState<{ control_id: string | null; location_id: string | null }[]>([]);

  useEffect(() => {
    if (!open) {
      setMode(null);
      setMessages([]);
      setInput("");
      setChatId(null);
      setPending([]);
      setRant("");
      setSuggestions(null);
      setAddedFindings(new Set());
      setAddedRemediations(new Set());
      setFindingOverrides([]);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // The assistant works through audiTrack's MCP tools; changes wait for approval.
  const applyTurn = (t: AssistantTurn) => {
    setChatId(t.chatId);
    setPending(t.pending);
    if (t.reply || t.actions.length) setMessages((m) => [...m, { role: "assistant", content: t.reply, actions: t.actions }]);
    if (t.actions.some((a) => a.write && a.ok)) {
      clearBootstrapCache();
      qc.invalidateQueries();
    }
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy || pending.length) return;
    const before = messages;
    setMessages([...messages, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const res = await apiPost("assistant/message", { chatId, message: q });
      applyTurn(res.data as AssistantTurn);
    } catch (e) {
      toast.error(`Ask AI failed: ${(e as Error).message}`);
      setMessages(before);
      setInput(q);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (approve: boolean) => {
    if (!chatId || busy) return;
    setBusy(true);
    try {
      const res = await apiPost("assistant/decision", { chatId, approve });
      applyTurn(res.data as AssistantTurn);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    const text = rant.trim();
    if (!text || analyzing) return;
    setAnalyzing(true);
    setSuggestions(null);
    try {
      const data = await apiPost("ask-ai", { mode: "rant", rant: text });
      if (data?.error) throw new Error(data.error);
      if (!data.suggestions) {
        toast.error("AI could not parse a structured response. Try rephrasing.");
        return;
      }
      const s: Suggestions = data.suggestions;
      setSuggestions(s);
      setFindingOverrides(s.findings.map((f: SuggestionFinding) => ({
        control_id: f.control_id,
        location_id: f.location_id,
      })));
    } catch (e) {
      toast.error(`Analysis failed: ${(e as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const addFinding = async (idx: number) => {
    if (!suggestions) return;
    const f = suggestions.findings[idx];
    const overrides = findingOverrides[idx];
    const control_id = overrides.control_id;
    const location_id = overrides.location_id;
    if (!control_id || !location_id) {
      toast.error("Please select a control and location before adding.");
      return;
    }
    try {
      await apiPost("findings", {
        title: f.title,
        description: f.description,
        severity: f.severity,
        control_id,
        location_id,
        status: "todo",
      });
      clearBootstrapCache();
      qc.invalidateQueries({ queryKey: ["findings"] });
      setAddedFindings((prev) => new Set([...prev, idx]));
      toast.success("Finding added");
    } catch (e) {
      toast.error(`Failed to add finding: ${(e as Error).message}`);
    }
  };

  const addRemediation = async (idx: number) => {
    if (!suggestions) return;
    const r = suggestions.remediations[idx];
    try {
      const bootstrapData = await getBootstrapData();
      const existing = bootstrapData.remediation_plans as { code: string | null }[];
      const max = existing.reduce((acc: number, p: { code: string | null }) => {
        const m = p.code?.match(/^RP-(\d+)$/);
        const n = m ? parseInt(m[1], 10) : 0;
        return n > acc ? n : acc;
      }, 0);
      const nextCode = `RP-${String(max + 1).padStart(3, "0")}`;
      const description = [
        r.description,
        r.steps.length ? `\n\nSteps:\n${r.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "",
        r.related_finding_titles.length ? `\n\nRelated findings: ${r.related_finding_titles.join(", ")}` : "",
      ].join("").trim();
      await apiPost("remediation-plans", {
        code: nextCode,
        title: r.title,
        description,
        effort_days: r.effort_days ?? undefined,
      });
      clearBootstrapCache();
      qc.invalidateQueries({ queryKey: ["remediation_plans"] });
      setAddedRemediations((prev) => new Set([...prev, idx]));
      toast.success("Remediation plan added");
    } catch (e) {
      toast.error(`Failed to add remediation: ${(e as Error).message}`);
    }
  };

  const controlLabel = (id: string) => {
    const c = controls.find((x) => x.id === id);
    if (!c) return id;
    const cat = c.catalog_id ? catalog.find((k) => k.id === c.catalog_id) : null;
    return cat ? `[${cat.code}] ${cat.name}` : c.name;
  };

  const locationLabel = (id: string) => {
    const l = locations.find((x) => x.id === id);
    if (!l) return id;
    const c = clients.find((x) => x.id === l.client_id);
    return c ? `${c.name} / ${l.name}` : l.name;
  };

  const isWide = mode === "rant" && !!suggestions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`flex max-h-[90vh] flex-col transition-all ${isWide ? "max-w-5xl" : "max-w-2xl"}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Ask AI
            {mode && (
              <button
                onClick={() => { setMode(null); setSuggestions(null); }}
                className="ml-2 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Mode selector */}
        {!mode && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8">
            <p className="text-sm text-muted-foreground">How would you like to use the AI assistant?</p>
            <div className="flex gap-4">
              <button
                onClick={() => setMode("question")}
                className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center transition-colors hover:border-primary hover:bg-primary/5 w-44"
              >
                <MessageCircle className="h-8 w-8 text-primary" />
                <div>
                  <div className="font-semibold">Question</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Ask anything about your audit data</div>
                </div>
              </button>
              <button
                onClick={() => setMode("rant")}
                className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center transition-colors hover:border-primary hover:bg-primary/5 w-44"
              >
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <div className="font-semibold">Rant mode</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Paste a report and auto-generate findings</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Question mode */}
        {mode === "question" && (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto -mx-2 px-2">
              <div className="space-y-4 py-2">
                {messages.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Ask a question about your clients, controls, findings, remediation plans or solutions — or ask the assistant to make a change.
                    It works through audiTrack's MCP tools; every change is shown to you for approval first.
                    <div className="mt-3 space-y-1 text-xs">
                      <div>· "Which critical findings are still open per location?"</div>
                      <div>· "Which controls have the most open findings?"</div>
                      <div>· "Create a remediation plan for the open MFA findings and assign it to Sanne."</div>
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : "space-y-2"}>
                    {m.role === "user" ? (
                      <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
                        {m.content}
                      </div>
                    ) : (
                      <>
                        {!!m.actions?.length && (
                          <div className="flex flex-wrap gap-1">
                            {m.actions.map((a, j) => (
                              <Badge key={j} variant={a.write ? "default" : "outline"} className="gap-1 text-[11px] font-normal">
                                {a.ok ? <CheckCircle2 className="h-3 w-3" /> : "✕"} {a.title}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {m.content && (
                          <div className="prose prose-sm max-w-none text-sm dark:prose-invert">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {pending.length > 0 && (
                  <div className="space-y-3 rounded-lg border border-primary/40 bg-primary-soft p-3 text-sm">
                    <div className="font-medium">The assistant wants to make {pending.length === 1 ? "this change" : `${pending.length} changes`}:</div>
                    {pending.map((p) => (
                      <div key={p.id} className="rounded-md border bg-card p-2">
                        <div className="font-medium">{p.title}</div>
                        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                          {Object.entries(p.args).map(([k, v]) => (
                            <div key={k} className="contents">
                              <dt className="text-muted-foreground">{k}</dt>
                              <dd className="break-words">{argValue(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decide(true)} disabled={busy}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decide(false)} disabled={busy}>Decline</Button>
                    </div>
                  </div>
                )}
                {busy && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-end gap-2 border-t border-border pt-3">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={pending.length ? "Approve or decline the proposed change first…" : "Ask a question…"}
                className="min-h-[44px] flex-1 resize-none"
                disabled={busy || pending.length > 0}
                autoFocus
              />
              <Button onClick={send} disabled={busy || !input.trim() || pending.length > 0} size="icon">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </>
        )}

        {/* Rant mode */}
        {mode === "rant" && (
          <div className={`flex flex-1 overflow-hidden gap-4 ${suggestions ? "flex-row" : "flex-col"}`}>
            {/* Left: input */}
            <div className={`flex flex-col gap-3 ${suggestions ? "w-[40%] shrink-0" : "flex-1"}`}>
              {!suggestions && (
                <p className="text-sm text-muted-foreground">
                  Paste a report, audit observation, or story. The AI will identify findings and suggest remediations with step-by-step approaches.
                </p>
              )}
              <Textarea
                value={rant}
                onChange={(e) => setRant(e.target.value)}
                placeholder="Paste your report or story here…"
                className={`flex-1 resize-none ${suggestions ? "h-full min-h-[200px]" : "min-h-[200px]"}`}
                disabled={analyzing}
                autoFocus
              />
              <Button onClick={analyze} disabled={analyzing || !rant.trim()} className="gap-2">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {analyzing ? "Analyzing…" : suggestions ? "Re-analyze" : "Analyze"}
              </Button>
            </div>

            {/* Right: suggestions */}
            {suggestions && (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {suggestions.summary && (
                  <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                    {suggestions.summary}
                  </div>
                )}

                {suggestions.findings.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Findings ({suggestions.findings.length})</h3>
                    <div className="space-y-3">
                      {suggestions.findings.map((f, idx) => (
                        <div key={idx} className="rounded-xl border border-border bg-card p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium text-sm leading-snug">{f.title}</span>
                            <SeverityBadge severity={f.severity} />
                          </div>
                          {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                          <div className="flex flex-wrap gap-2">
                            <Select
                              value={findingOverrides[idx]?.control_id ?? ""}
                              onValueChange={(v) => setFindingOverrides((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], control_id: v || null };
                                return next;
                              })}
                            >
                              <SelectTrigger className="h-7 w-auto max-w-[200px] text-xs">
                                <SelectValue placeholder="Select control…">
                                  {findingOverrides[idx]?.control_id ? controlLabel(findingOverrides[idx].control_id!) : "Select control…"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {controls
                                  .map((c) => {
                                    const cat = c.catalog_id ? catalog.find((k) => k.id === c.catalog_id) : null;
                                    const label = cat ? `[${cat.code}] ${cat.name}` : c.name;
                                    return { id: c.id, label };
                                  })
                                  .map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select
                              value={findingOverrides[idx]?.location_id ?? ""}
                              onValueChange={(v) => setFindingOverrides((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], location_id: v || null };
                                return next;
                              })}
                            >
                              <SelectTrigger className="h-7 w-auto max-w-[200px] text-xs">
                                <SelectValue placeholder="Select location…">
                                  {findingOverrides[idx]?.location_id ? locationLabel(findingOverrides[idx].location_id!) : "Select location…"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {locations.map((l) => {
                                  const c = clients.find((x) => x.id === l.client_id);
                                  return <SelectItem key={l.id} value={l.id}>{c ? `${c.name} / ${l.name}` : l.name}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex justify-end">
                            {addedFindings.has(idx) ? (
                              <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Added</span>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => addFinding(idx)}>
                                <Plus className="h-3 w-3" /> Add finding
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {suggestions.remediations.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Remediations ({suggestions.remediations.length})</h3>
                    <div className="space-y-3">
                      {suggestions.remediations.map((r, idx) => (
                        <div key={idx} className="rounded-xl border border-border bg-card p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium text-sm leading-snug">{r.title}</span>
                            {r.effort_days != null && (
                              <Badge variant="secondary" className="shrink-0 text-xs">{r.effort_days}d</Badge>
                            )}
                          </div>
                          {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                          {r.steps.length > 0 && (
                            <ol className="list-decimal list-inside space-y-0.5 text-xs text-muted-foreground">
                              {r.steps.map((s, si) => <li key={si}>{s}</li>)}
                            </ol>
                          )}
                          {r.related_finding_titles.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {r.related_finding_titles.map((t, ti) => (
                                <Badge key={ti} variant="outline" className="text-xs">{t}</Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex justify-end">
                            {addedRemediations.has(idx) ? (
                              <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Added</span>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => addRemediation(idx)}>
                                <Plus className="h-3 w-3" /> Add remediation
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
