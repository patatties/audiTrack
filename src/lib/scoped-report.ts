import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getBootstrapData } from "@/lib/bootstrap";
import { apiPost } from "@/lib/api";
import type {
  Client, Location, Control, ControlCatalog, Finding, FindingSeverity,
  RemediationPlan, Comment,
} from "@/lib/types";

interface ScopeArgs {
  clientId?: string | null;
  locationId?: string | null;
}

const C = {
  ink: [24, 28, 36] as [number, number, number],
  muted: [110, 118, 130] as [number, number, number],
  line: [220, 224, 230] as [number, number, number],
  bg: [248, 249, 251] as [number, number, number],
  primary: [59, 88, 158] as [number, number, number],
  success: [34, 139, 89] as [number, number, number],
  warn: [217, 154, 32] as [number, number, number],
  danger: [200, 50, 60] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const SEV_COLOR: Record<FindingSeverity, [number, number, number]> = {
  critical: C.danger,
  high: [232, 109, 56],
  medium: C.warn,
  low: [120, 144, 180],
};

export async function generateScopedReport(scope: ScopeArgs) {
  // ---------- Load all data and filter by scope ----------
  const data = await getBootstrapData();

  const clients = (data.clients as Client[]).slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const allLocations = (data.locations as Location[]).slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const controls = data.controls as Control[];
  const catalog = (data.control_catalog as ControlCatalog[]).slice().sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));
  const allFindings = data.findings as Finding[];
  const allPlans = (data.remediation_plans as RemediationPlan[]).slice().sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));
  const planFindingLinks = data.remediation_plan_findings as { plan_id: string; finding_id: string }[];
  const comments = (data.comments as Comment[]).slice().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 200);

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const locById = new Map(allLocations.map((l) => [l.id, l]));
  const ctrlById = new Map(controls.map((c) => [c.id, c]));
  const catById = new Map(catalog.map((c) => [c.id, c]));
  const ctrlLabel = (id: string) => {
    const ctrl = ctrlById.get(id);
    if (!ctrl) return "—";
    const cat = ctrl.catalog_id ? catById.get(ctrl.catalog_id) : null;
    return `${cat?.code ? cat.code + " · " : ""}${cat?.name ?? ctrl.name}`;
  };

  // Resolve scope
  let scopedLocations = allLocations;
  let scopedClient: Client | null = null;
  let scopedLocation: Location | null = null;
  if (scope.locationId) {
    scopedLocation = locById.get(scope.locationId) ?? null;
    scopedLocations = scopedLocation ? [scopedLocation] : [];
    if (scopedLocation) scopedClient = clientById.get(scopedLocation.client_id) ?? null;
  } else if (scope.clientId) {
    scopedClient = clientById.get(scope.clientId) ?? null;
    scopedLocations = allLocations.filter((l) => l.client_id === scope.clientId);
  }
  const scopedLocIds = new Set(scopedLocations.map((l) => l.id));

  const findings = allFindings.filter((f) => scopedLocIds.has(f.location_id));
  const findingIds = new Set(findings.map((f) => f.id));

  // Plans whose linked findings include any scoped finding
  const planLinkMap = new Map<string, string[]>();
  for (const r of planFindingLinks) {
    (planLinkMap.get(r.plan_id) ?? planLinkMap.set(r.plan_id, []).get(r.plan_id)!).push(r.finding_id);
  }
  const plans = allPlans.filter((p) =>
    (planLinkMap.get(p.id) ?? []).some((fid) => findingIds.has(fid)),
  );
  const planIds = new Set(plans.map((p) => p.id));
  const scopedComments = comments.filter((c) => planIds.has(c.plan_id));

  // ---------- Metrics ----------
  const total = findings.length;
  const open = findings.filter((f) => f.status !== "done").length;
  const inProgress = findings.filter((f) => f.status === "in_progress").length;
  const done = findings.filter((f) => f.status === "done").length;
  const openCritical = findings.filter((f) => f.severity === "critical" && f.status !== "done").length;
  const openHigh = findings.filter((f) => f.severity === "high" && f.status !== "done").length;
  const overallPct = total ? Math.round((done / total) * 100) : 0;
  const openPlans = plans.filter((p) => p.status !== "done");
  const totalEffort = openPlans.reduce((s, p) => s + (Number(p.effort_days) || 0), 0);

  // ---------- Activities (in-scope) ----------
  type Activity = { at: string; kind: string; title: string; detail?: string };
  const activities: Activity[] = [];
  for (const f of findings) {
    activities.push({ at: f.created_at, kind: "Finding opened", title: f.title, detail: `${f.severity} severity` });
    if (f.status === "done" && f.updated_at !== f.created_at) {
      activities.push({ at: f.updated_at, kind: "Finding closed", title: f.title });
    } else if (f.status === "in_progress" && f.updated_at !== f.created_at) {
      activities.push({ at: f.updated_at, kind: "Work started", title: f.title });
    }
  }
  for (const c of scopedComments) {
    const plan = plans.find((p) => p.id === c.plan_id);
    activities.push({
      at: c.created_at, kind: "Comment",
      title: plan ? `${plan.code ? plan.code + " · " : ""}${plan.title}` : "Remediation plan",
      detail: `${c.author || "Anonymous"}: ${c.body.slice(0, 160)}`,
    });
  }
  activities.sort((a, b) => (a.at < b.at ? 1 : -1));

  // ---------- AI summary ----------
  let summary = "";
  try {
    const result = await apiPost("generate-scoped-summary", {
      scope: { clientName: scopedClient?.name, siteName: scopedLocation?.name },
      metrics: {
        totalFindings: total, open, inProgress, done,
        openCritical, openHigh,
        totalEffortDays: totalEffort, plansOpen: openPlans.length,
      },
      findings: findings
        .filter((f) => f.status !== "done")
        .map((f) => ({ title: f.title, severity: f.severity, status: f.status, description: f.description })),
      plans: openPlans.map((p) => ({
        code: p.code, title: p.title, status: p.status,
        effort_days: p.effort_days, description: p.description,
      })),
      activities: activities.slice(0, 30),
    });
    summary = (result as { summary?: string })?.summary ?? "";
  } catch (e) {
    summary = `Management summary unavailable: ${(e as Error).message}`;
  }

  // ---------- Build PDF ----------
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  const scopeTitle = scopedLocation
    ? `${clientById.get(scopedLocation.client_id)?.name ?? ""} — ${scopedLocation.name}`
    : scopedClient
    ? scopedClient.name
    : "Full portfolio";
  const scopeKind = scopedLocation ? "Site report" : scopedClient ? "Client report" : "Portfolio report";

  // ----- COVER -----
  setFill(doc, C.ink); doc.rect(0, 0, W, H, "F");
  setFill(doc, C.primary); doc.rect(0, H - 10, W, 10, "F");
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("AUDIT REMEDIATION", M, M + 24);
  doc.setDrawColor(...C.primary); doc.setLineWidth(2);
  doc.line(M, M + 32, M + 50, M + 32);

  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.setTextColor(200, 210, 225);
  doc.text(scopeKind.toUpperCase(), M, H / 2 - 100);

  doc.setFont("helvetica", "bold"); doc.setFontSize(34); doc.setTextColor(...C.white);
  doc.text(splitToWidth(doc, scopeTitle, W - M * 2), M, H / 2 - 60);

  doc.setFont("helvetica", "normal"); doc.setFontSize(12);
  doc.setTextColor(200, 210, 225);
  const subtitle = scopedLocation
    ? `Site-level remediation status`
    : scopedClient
    ? `${scopedLocations.length} sites in scope`
    : `${clients.length} clients · ${scopedLocations.length} sites`;
  doc.text(subtitle, M, H / 2 - 10);
  doc.setFontSize(10);
  doc.text(
    new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    M, H / 2 + 8,
  );

  // big completion ring
  const cx = W / 2, cy = H / 2 + 130, r = 64;
  drawRing(doc, cx, cy, r, overallPct, C.primary, [60, 70, 90]);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold"); doc.setFontSize(30);
  doc.text(`${overallPct}%`, cx, cy + 8, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.setTextColor(200, 210, 225);
  doc.text("findings resolved in scope", cx, cy + 26, { align: "center" });

  // ----- METRICS PAGE -----
  doc.addPage();
  pageHeader(doc, "Report scope & metrics", M, W);

  let y = 110;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...C.muted);
  doc.text("SCOPE", M, y); y += 14;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...C.ink);
  doc.text(scopeTitle, M, y); y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...C.muted);
  const inScope = scopedLocation
    ? `Site report. ${total} findings, ${openPlans.length} active plans.`
    : scopedClient
    ? `Client report covering ${scopedLocations.length} site(s), ${total} findings, ${openPlans.length} active plans.`
    : `Portfolio report. ${total} findings, ${openPlans.length} active plans.`;
  doc.text(splitToWidth(doc, inScope, W - M * 2), M, y);
  y += 28;

  // KPI cards
  const kpiW = (W - M * 2 - 24) / 4;
  kpiCard(doc, M + 0 * (kpiW + 8), y, kpiW, 78, "Total findings", String(total), C.primary);
  kpiCard(doc, M + 1 * (kpiW + 8), y, kpiW, 78, "Open", String(open), C.warn, `${total - done} of ${total}`);
  kpiCard(doc, M + 2 * (kpiW + 8), y, kpiW, 78, "Resolved", String(done), C.success, `${overallPct}%`);
  kpiCard(doc, M + 3 * (kpiW + 8), y, kpiW, 78, "Open critical", String(openCritical), C.danger);
  y += 96;

  const kpi2W = (W - M * 2 - 16) / 3;
  kpiCard(doc, M + 0 * (kpi2W + 8), y, kpi2W, 78, "Open high", String(openHigh), SEV_COLOR.high);
  kpiCard(doc, M + 1 * (kpi2W + 8), y, kpi2W, 78, "Active plans", String(openPlans.length), C.primary);
  kpiCard(doc, M + 2 * (kpi2W + 8), y, kpi2W, 78, "Effort outstanding", `${formatNum(totalEffort)} d`, C.ink);
  y += 96;

  // ---- Management summary ----
  cardBg(doc, M, y, W - M * 2, 0); // placeholder height set below
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...C.ink);
  doc.text("Management summary", M + 16, y + 22);
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...C.muted);
  doc.text("Generated by AI from the activities and findings still in scope.", M + 16, y + 36);

  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...C.ink);
  const summaryLines = doc.splitTextToSize(
    summary || "No summary generated.",
    W - M * 2 - 32,
  ) as string[];
  let sy = y + 56;
  // recompute card height
  const cardH = 56 + summaryLines.length * 13 + 16;
  setFill(doc, C.bg);
  doc.roundedRect(M, y, W - M * 2, cardH, 6, 6, "F");
  // re-draw heading on top of fill
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...C.ink);
  doc.text("Management summary", M + 16, y + 22);
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...C.muted);
  doc.text("Generated by AI from the activities and findings still in scope.", M + 16, y + 36);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...C.ink);
  for (const line of summaryLines) {
    if (sy > H - M - 20) { doc.addPage(); pageHeader(doc, "Management summary (cont.)", M, W); sy = 110; }
    doc.text(line, M + 16, sy);
    sy += 13;
  }

  // ----- TIMETABLE PAGE -----
  doc.addPage();
  pageHeader(doc, "Effort timetable — open work", M, W);

  // Sort open plans: in_progress first, then todo, then by effort desc
  const orderedPlans = [...openPlans].sort((a, b) => {
    const sr = (s: string) => (s === "in_progress" ? 0 : s === "todo" ? 1 : 2);
    return sr(a.status) - sr(b.status) || (Number(b.effort_days) || 0) - (Number(a.effort_days) || 0);
  });

  // Gantt-ish timetable: cumulative bars assuming sequential calendar days from today
  const timetableTop = 110;
  const labelW = 220;
  const chartX = M + labelW;
  const chartW = W - M - chartX;
  const totalDaysAxis = Math.max(5, Math.ceil(totalEffort || orderedPlans.length));
  const dayPx = chartW / totalDaysAxis;

  // Axis
  doc.setDrawColor(...C.line); doc.setLineWidth(0.5);
  doc.line(chartX, timetableTop, chartX + chartW, timetableTop);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.muted);
  const ticks = 6;
  for (let i = 0; i <= ticks; i++) {
    const d = Math.round((totalDaysAxis / ticks) * i);
    const x = chartX + (chartW / ticks) * i;
    doc.line(x, timetableTop - 4, x, timetableTop);
    doc.text(`${d}d`, x, timetableTop - 8, { align: "center" });
  }

  let ty = timetableTop + 16;
  let cursorDay = 0;
  const rowH = 18;
  for (const p of orderedPlans) {
    if (ty + rowH > H - M) {
      doc.addPage(); pageHeader(doc, "Effort timetable (cont.)", M, W);
      ty = 110;
    }
    // Label
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...C.ink);
    doc.text(truncate(`${p.code ? p.code + " · " : ""}${p.title}`, 44), M, ty + 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.muted);
    doc.text(p.status === "in_progress" ? "In progress" : "To do", M, ty + 22);

    const eff = Number(p.effort_days) || 0;
    const x = chartX + cursorDay * dayPx;
    const w = Math.max(2, eff * dayPx);
    setFill(doc, p.status === "in_progress" ? C.primary : SEV_COLOR.medium);
    doc.roundedRect(x, ty + 4, w, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...C.ink);
    doc.text(eff > 0 ? `${formatNum(eff)} d` : "—", x + w + 4, ty + 14);
    cursorDay += eff;
    ty += rowH + 6;
  }

  if (orderedPlans.length === 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.setTextColor(...C.muted);
    doc.text("No open remediation plans in this scope.", M, ty + 12);
  } else {
    ty += 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...C.ink);
    doc.text(`Total estimated effort: ${formatNum(totalEffort)} days`, M, ty);
  }

  // ----- OPEN FINDINGS TABLE (still in scope) -----
  doc.addPage();
  pageHeader(doc, "Open findings in scope", M, W);
  const openFindings = findings
    .filter((f) => f.status !== "done")
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity));

  autoTable(doc, {
    startY: 110,
    margin: { left: M, right: M },
    head: [["Severity", "Status", "Site", "Control", "Finding"]],
    body: openFindings.map((f) => {
      const loc = locById.get(f.location_id);
      return [
        f.severity.toUpperCase(),
        f.status === "in_progress" ? "In progress" : "To do",
        loc?.name ?? "—",
        ctrlLabel(f.control_id),
        f.title,
      ];
    }),
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: C.ink, textColor: C.white },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      1: { cellWidth: 70 },
      2: { cellWidth: 110 },
      3: { cellWidth: 130 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const sev = openFindings[data.row.index].severity;
        data.cell.styles.textColor = SEV_COLOR[sev];
      }
    },
  });

  // ----- TASK WRITE-UPS (full plan details) -----
  doc.addPage();
  pageHeader(doc, "Tasks to be completed", M, W);

  let wy = 110;
  for (const p of orderedPlans) {
    const block = estimatePlanBlockHeight(doc, p, W - M * 2);
    if (wy + block > H - M) { doc.addPage(); pageHeader(doc, "Tasks to be completed (cont.)", M, W); wy = 110; }

    setFill(doc, C.bg);
    doc.roundedRect(M, wy, W - M * 2, block, 6, 6, "F");

    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...C.ink);
    doc.text(`${p.code ? p.code + " · " : ""}${p.title}`, M + 14, wy + 22);

    // chips line
    const chipsY = wy + 38;
    let cxp = M + 14;
    cxp = miniChip(doc, cxp, chipsY, p.status === "in_progress" ? "In progress" : p.status === "done" ? "Done" : "To do",
      p.status === "in_progress" ? C.primary : p.status === "done" ? C.success : C.muted);
    if (p.effort_days != null) cxp = miniChip(doc, cxp, chipsY, `${formatNum(Number(p.effort_days))} days`, C.ink);
    if (p.assignee) cxp = miniChip(doc, cxp, chipsY, p.assignee, C.muted);
    if (p.due_date) cxp = miniChip(doc, cxp, chipsY, `Due ${p.due_date}`, C.warn);

    // Linked findings
    const linked = (planLinkMap.get(p.id) ?? []).map((fid) => allFindings.find((f) => f.id === fid)).filter(Boolean) as Finding[];
    let by = chipsY + 28;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...C.muted);
    doc.text("LINKED FINDINGS", M + 14, by); by += 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...C.ink);
    if (linked.length === 0) {
      doc.text("—", M + 14, by); by += 12;
    } else {
      for (const f of linked) {
        const loc = locById.get(f.location_id);
        const line = `• [${f.severity.toUpperCase()}] ${f.title}${loc ? ` — ${loc.name}` : ""}`;
        const lines = doc.splitTextToSize(line, W - M * 2 - 28) as string[];
        for (const l of lines) { doc.text(l, M + 14, by); by += 12; }
      }
    }

    // Description
    by += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...C.muted);
    doc.text("PLAN DETAILS", M + 14, by); by += 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...C.ink);
    const descLines = doc.splitTextToSize(p.description?.trim() || "No description.", W - M * 2 - 28) as string[];
    for (const l of descLines) {
      if (by > wy + block - 8) break;
      doc.text(l, M + 14, by); by += 12;
    }

    wy += block + 12;
  }

  if (orderedPlans.length === 0) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(...C.muted);
    doc.text("No open tasks in this scope.", M, wy);
  }

  // Footer
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.line); doc.setLineWidth(0.5);
    doc.line(M, H - 26, W - M, H - 26);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.muted);
    doc.text(`${scopeKind} · ${scopeTitle}`, M, H - 12);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 12, { align: "right" });
  }

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const filename = `audit-${scopedLocation ? "site-" + slug(scopedLocation.name) : scopedClient ? "client-" + slug(scopedClient.name) : "portfolio"}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// ---------- helpers ----------
function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }
function sevRank(s: FindingSeverity) { return { critical: 4, high: 3, medium: 2, low: 1 }[s]; }
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function formatNum(n: number) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
function splitToWidth(doc: jsPDF, s: string, w: number) {
  const lines = doc.splitTextToSize(s, w) as string[];
  return lines.join("\n");
}

function pageHeader(doc: jsPDF, title: string, M: number, W: number) {
  doc.setTextColor(110, 118, 130);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("AUDIT REMEDIATION", M, 40);
  doc.setDrawColor(59, 88, 158); doc.setLineWidth(2);
  doc.line(M, 46, M + 50, 46);
  doc.setTextColor(24, 28, 36);
  doc.setFontSize(20);
  doc.text(title, M, 76);
  doc.setDrawColor(220, 224, 230); doc.setLineWidth(0.5);
  doc.line(M, 88, W - M, 88);
}

function cardBg(doc: jsPDF, x: number, y: number, w: number, h: number) {
  if (h <= 0) return;
  setFill(doc, C.bg);
  doc.roundedRect(x, y, w, h, 6, 6, "F");
}

function kpiCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, color: [number, number, number], sub?: string,
) {
  cardBg(doc, x, y, w, h);
  setFill(doc, color);
  doc.rect(x, y, 4, h, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...C.muted);
  doc.text(label.toUpperCase(), x + 14, y + 20);
  doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.setTextColor(...C.ink);
  doc.text(value, x + 14, y + 52);
  if (sub) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(color[0], color[1], color[2]);
    doc.text(sub, x + w - 14, y + 52, { align: "right" });
  }
}

function miniChip(doc: jsPDF, x: number, y: number, label: string, color: [number, number, number]) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  const tw = doc.getTextWidth(label) + 14;
  setFill(doc, color);
  doc.roundedRect(x, y - 9, tw, 14, 3, 3, "F");
  doc.setTextColor(...C.white);
  doc.text(label, x + 7, y);
  return x + tw + 6;
}

function drawRing(doc: jsPDF, cx: number, cy: number, r: number, pct: number,
  fg: [number, number, number], bg: [number, number, number]) {
  // simple ring approximation with arc segments
  const segs = 64;
  doc.setLineWidth(10);
  doc.setDrawColor(bg[0], bg[1], bg[2]);
  for (let i = 0; i < segs; i++) {
    const a1 = (i / segs) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 1) / segs) * Math.PI * 2 - Math.PI / 2;
    doc.line(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
  }
  doc.setDrawColor(fg[0], fg[1], fg[2]);
  const done = Math.round((pct / 100) * segs);
  for (let i = 0; i < done; i++) {
    const a1 = (i / segs) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 1) / segs) * Math.PI * 2 - Math.PI / 2;
    doc.line(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
  }
}

function estimatePlanBlockHeight(doc: jsPDF, p: RemediationPlan, contentW: number) {
  // header + chips + linked findings header + lines + plan details header + lines
  const desc = doc.splitTextToSize(p.description?.trim() || "No description.", contentW - 28).length;
  // We can't know linked findings count here without re-querying; assume up to 3 lines
  return 24 /* title */ + 22 /* chips area */ + 14 + 14 + 4 /* linked findings header + entry */
    + 14 + Math.min(40, desc) * 12 + 16;
}
