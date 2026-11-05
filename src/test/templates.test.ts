import { describe, expect, it } from "vitest";
import { BASELINE_SETS, CONTROL_SETS, FRAMEWORKS, SOLUTION_TEMPLATES, frameworkControls, templateControlsByCode } from "../../server/setup/templates.js";
import { normalizePlan, textToHtml } from "../../server/setup/apply.js";

type Control = { code: string; name: string; description: string; essential?: boolean };
type ControlSet = { id: string; kind: string; framework?: string; controls: Control[] };

describe("control templates", () => {
  const all: Control[] = (CONTROL_SETS as ControlSet[]).flatMap((s) => s.controls);

  it("has unique control codes", () => {
    const codes = all.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("contains all 93 ISO/IEC 27001:2022 Annex A controls", () => {
    const iso: Control[] = frameworkControls("iso27001-2022");
    expect(iso).toHaveLength(93);
    expect(FRAMEWORKS.map((f: { id: string }) => f.id)).toContain("iso27001-2022");
  });

  it("marks essential controls in the recommended baseline", () => {
    const baseline: Control[] = (BASELINE_SETS as ControlSet[]).flatMap((s) => s.controls);
    expect(baseline.length).toBeGreaterThan(0);
    expect(baseline.some((c) => c.essential)).toBe(true);
  });

  it("links solutions only to existing controls", () => {
    const byCode: Map<string, Control> = templateControlsByCode();
    for (const s of SOLUTION_TEMPLATES as { code: string; controls: string[] }[]) {
      for (const code of s.controls) expect(byCode.has(code), `${s.code} -> ${code}`).toBe(true);
    }
  });
});

describe("setup plan", () => {
  it("drops empty items and trims names", () => {
    const plan = normalizePlan({
      clients: [{ name: "  Acme  ", locations: ["HQ", "HQ", " "] }, { name: "" }],
      controls: [{ name: "MFA", code: "PR-02" }, { name: "" }],
      solutions: [{ title: "Guide", tags: ["A", "a"] }],
    });
    expect(plan.clients).toEqual([{ name: "Acme", description: null, locations: ["HQ"] }]);
    expect(plan.controls).toHaveLength(1);
    expect(plan.solutions[0].tags).toEqual(["a"]);
  });

  it("escapes HTML when turning AI text into HTML", () => {
    expect(textToHtml("Hello <script>")).toBe("<p>Hello &lt;script&gt;</p>");
    expect(textToHtml("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
  });
});
