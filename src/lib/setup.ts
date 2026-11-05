import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

export type SetupStatus = {
  completed: boolean;
  completedAt: string | null;
  empty: boolean;
  counts: Record<string, number>;
  aiAvailable: boolean;
  aiProvider: string | null;
};

export type TemplateControl = { code: string; name: string; description: string; essential?: boolean };
/** kind "baseline": recommended controls (CIS v8 / NIST CSF 2.0); kind "framework": a theme of a framework such as ISO 27001. */
export type ControlSet = {
  id: string; name: string; description: string; controls: TemplateControl[];
  kind: "baseline" | "framework"; framework?: string;
};
export type Framework = { id: string; name: string; description: string };
export type TemplateSolution = { code: string; title: string; body: string; tags: string[]; controls: string[] };
export type SetupTemplates = { controlSets: ControlSet[]; frameworks: Framework[]; solutions: TemplateSolution[] };

export type Source = "template" | "ai" | "own";
export type PlanClient = { name: string; description: string | null; locations: string[] };
export type PlanControl = { code: string | null; name: string; description: string | null; source?: Source };
export type PlanSolution = { code: string | null; title: string; body: string; tags: string[]; controls: string[]; source?: Source };
export type SetupPlan = { clients: PlanClient[]; controls: PlanControl[]; solutions: PlanSolution[] };
export type AiProposal = { summary: string; plan: SetupPlan };
export type SetupCounts = Record<string, number>;

const data = <T,>(res: { ok: boolean; data: T; error?: string }) => {
  if (!res?.ok) throw new Error(res?.error ?? "Request failed");
  return res.data;
};

export const setupApi = {
  status: async () => data<SetupStatus>(await apiGet("setup")),
  templates: async () => data<SetupTemplates>(await apiGet("setup/templates")),
  apply: async (plan: SetupPlan) => data<SetupCounts>(await apiPost("setup/apply", plan)),
  /** Saves a reviewed AI proposal through audiTrack's MCP server. */
  applyAi: async (plan: SetupPlan) => data<SetupCounts>(await apiPost("setup/apply-ai", plan)),
  ai: async (description: string) => data<AiProposal>(await apiPost("setup/ai", { description })),
  demo: async () => data<SetupCounts>(await apiPost("setup/demo", {})),
  complete: async (skipped: boolean) => apiPost("setup/complete", { skipped }),
  reset: async () => {
    const res = await apiPost("setup/reset", { confirm: "DELETE" });
    if (!res?.ok) throw new Error(res?.error ?? "Delete failed");
  },
};

export function useSetupStatus() {
  return useQuery({ queryKey: ["setup-status"], queryFn: setupApi.status, retry: 1, staleTime: 60_000 });
}

export function useSetupTemplates() {
  return useQuery({ queryKey: ["setup-templates"], queryFn: setupApi.templates, staleTime: Infinity });
}
