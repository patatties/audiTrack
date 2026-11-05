import type { Client, Finding, Location, Control, ControlCatalog, ControlRequirement } from "@/lib/types";

export type BootstrapData = {
  clients: Client[];
  locations: Location[];
  control_catalog: ControlCatalog[];
  controls: Control[];
  control_locations: { control_id: string; location_id: string; created_at?: string }[];
  findings: Finding[];
  remediation_plans: unknown[];
  remediation_plan_findings: unknown[];
  comments: unknown[];
  attachments: unknown[];
  notes: unknown[];
  solutions: unknown[];
  solution_controls: unknown[];
  solution_remediations: unknown[];
  control_requirements: ControlRequirement[];
  requirement_sources: { field: string; value: string }[];
};

let cachedBootstrap: BootstrapData | null = null;

export async function getBootstrapData(): Promise<BootstrapData> {
  if (cachedBootstrap) return cachedBootstrap;

  const response = await fetch("/api/bootstrap");

  if (!response.ok) {
    throw new Error(`Bootstrap API failed: ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || "Bootstrap API returned an error");
  }

  cachedBootstrap = result.data as BootstrapData;

  // pg can return text[] as a raw "{a,b}" string when type OIDs don't match — normalize eagerly
  const sols = cachedBootstrap.solutions as { tags: string[] | string | null }[];
  if (Array.isArray(sols)) {
    sols.forEach((s) => {
      if (!Array.isArray(s.tags)) {
        s.tags = typeof s.tags === "string"
          ? s.tags.replace(/^\{|\}$/g, "").split(",").map((t: string) => t.trim()).filter(Boolean)
          : [];
      }
    });
  }

  return cachedBootstrap;
}

export function clearBootstrapCache() {
  cachedBootstrap = null;
}
