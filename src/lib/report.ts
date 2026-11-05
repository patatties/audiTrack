import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getBootstrapData } from "@/lib/bootstrap";
import type {
  Client, Location, Control, ControlCatalog, Finding,
  FindingSeverity,
} from "@/lib/types";

interface ReportData {
  clients: Client[];
  locations: Location[];
  controls: Control[];
  catalog: ControlCatalog[];
  findings: Finding[];
  links: { control_id: string; location_id: string }[];
}

// Brand-ish palette tuned for print
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
  evidence: [41, 163, 155] as [number, number, number],
};

const SEV_COLOR: Record<FindingSeverity, [number, number, number]> = {
  critical: C.danger,
  high: [232, 109, 56],
  medium: C.warn,
  low: [120, 144, 180],
};

export async function generateReport() {
  const raw = await getBootstrapData();

  const data: ReportData = {
    clients: (raw.clients as Client[]).slice().sort((a, b) => a.name.localeCompare(b.name)),
    locations: (raw.locations as Location[]).slice().sort((a, b) => a.name.localeCompare(b.name)),
    controls: raw.controls as Control[],
    catalog: (raw.control_catalog as ControlCatalog[]).slice().sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "")),
    findings: raw.findings as Finding[],
    links: raw.control_locations as { control_id: string; location_id: string }[],
  };

  buildPdf(data);
}

function buildPdf(d: ReportData) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;

  const clientById = new Map(d.clients.map((c) => [c.id, c]));
  const locById = new Map(d.locations.map((l) => [l.id, l]));
  const ctrlById = new Map(d.controls.map((c) => [c.id, c]));
  const catById = new Map(d.catalog.map((c) => [c.id, c]));
  const ctrlLabel = (id: string) => {
    const ctrl = ctrlById.get(id);
    if (!ctrl) return "—";
    const cat = ctrl.catalog_id ? catById.get(ctrl.catalog_id) : null;
    return `${cat?.code ? cat.code + " · " : ""}${cat?.name ?? ctrl.name}`;
  };

  // Aggregates
  const total = d.findings.length;
  const done = d.findings.filter((f) => f.status === "done").length;
  const inProgress = d.findings.filter((f) => f.status === "in_progress").length;
  const gatheringEvidence = d.findings.filter((f) => f.status === "gathering_evidence").length;
  const todo = d.findings.filter((f) => f.status === "todo").length;
  const openCritical = d.findings.filter((f) => f.severity === "critical" && f.status !== "done").length;
  const openHigh = d.findings.filter((f) => f.severity === "high" && f.status !== "done").length;
  const overallPct = total ? Math.round((done / total) * 100) : 0;

  // ---------- COVER ----------
  setFill(doc, C.ink); doc.rect(0, 0, W, H, "F");
  setFill(doc, C.primary); doc.rect(0, H - 12, W, 12, "F");

  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("AUDIT REMEDIATION", M, M + 30);
  doc.setDrawColor(...C.primary); doc.setLineWidth(2);
  doc.line(M, M + 38, M + 60, M + 38);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(40);
  doc.text("Executive status report", M, H / 2 - 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(200, 210, 225);
  doc.text(
    `${d.clients.length} clients · ${d.locations.length} sites · ${d.catalog.length} controls`,
    M, H / 2,
  );
  doc.setFontSize(11);
  doc.text(
    new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    M, H / 2 + 22,
  );

  // Big completion ring
  const cx = W - M - 110, cy = H / 2 - 10, r = 70;
  drawRing(doc, cx, cy, r, overallPct, C.primary, [60, 70, 90]);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.text(`${overallPct}%`, cx, cy + 10, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 210, 225);
  doc.text("resolved", cx, cy + 28, { align: "center" });

  // ---------- PAGE 2: KPI overview ----------
  doc.addPage();
  pageHeader(doc, "Overview", M, W);

  const kpiY = 100;
  const kpiW = (W - M * 2 - 32) / 5;
  kpiCard(doc, M + 0 * (kpiW + 8), kpiY, kpiW, 80, "Total findings", String(total), C.primary);
  kpiCard(doc, M + 1 * (kpiW + 8), kpiY, kpiW, 80, "In progress", String(inProgress), C.primary);
  kpiCard(doc, M + 2 * (kpiW + 8), kpiY, kpiW, 80, "Gathering evidence", String(gatheringEvidence), C.evidence);
  kpiCard(doc, M + 3 * (kpiW + 8), kpiY, kpiW, 80, "Resolved", `${done}`, C.success, `${overallPct}%`);
  kpiCard(doc, M + 4 * (kpiW + 8), kpiY, kpiW, 80, "Open critical", String(openCritical), C.danger);

  // Status donut + severity bars row
  const rowY = kpiY + 110;
  const colW = (W - M * 2 - 24) / 2;

  // Status donut
  cardBg(doc, M, rowY, colW, 240);
  cardTitle(doc, "Status breakdown", M + 16, rowY + 26);
  const segments = [
    { value: done, color: C.success, label: "Done" },
    { value: gatheringEvidence, color: C.evidence, label: "Gathering evidence" },
    { value: inProgress, color: C.primary, label: "In progress" },
    { value: todo, color: C.muted, label: "To do" },
  ];
  drawDonut(doc, M + 80, rowY + 140, 60, 36, segments);
  // Legend
  const lx = M + 170;
  let ly = rowY + 80;
  for (const s of segments) {
    setFill(doc, s.color);
    doc.rect(lx, ly - 8, 10, 10, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...C.ink);
    doc.text(`${s.label}`, lx + 18, ly);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted);
    const pct = total ? Math.round((s.value / total) * 100) : 0;
    doc.text(`${s.value}  (${pct}%)`, lx + 18, ly + 13);
    ly += 30;
  }

  // Severity bars
  const sevX = M + colW + 24;
  cardBg(doc, sevX, rowY, colW, 240);
  cardTitle(doc, "Open findings by severity", sevX + 16, rowY + 26);
  const sevs: FindingSeverity[] = ["critical", "high", "medium", "low"];
  const sevData = sevs.map((sv) => ({
    sv,
    open: d.findings.filter((f) => f.severity === sv && f.status !== "done").length,
    done: d.findings.filter((f) => f.severity === sv && f.status === "done").length,
  }));
  const maxSev = Math.max(1, ...sevData.map((s) => s.open + s.done));
  let sy = rowY + 56;
  const barAreaW = colW - 200;
  for (const s of sevData) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...C.ink);
    doc.text(s.sv.toUpperCase(), sevX + 16, sy + 14);
    // open bar
    setFill(doc, SEV_COLOR[s.sv]);
    const openW = (s.open / maxSev) * barAreaW;
    doc.roundedRect(sevX + 90, sy + 4, openW, 14, 2, 2, "F");
    // done bar (lighter)
    setFill(doc, C.success);
    const doneW = (s.done / maxSev) * barAreaW;
    doc.roundedRect(sevX + 90 + openW, sy + 4, doneW, 14, 2, 2, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...C.muted);
    doc.text(`${s.open} open · ${s.done} done`, sevX + colW - 16, sy + 14, { align: "right" });
    sy += 36;
  }

  // ---------- PAGE 3: Per-client progress ----------
  doc.addPage();
  pageHeader(doc, "Progress by client", M, W);

  cardBg(doc, M, 100, W - M * 2, H - 100 - M);
  let py = 130;
  const innerX = M + 24;
  const innerW = W - M * 2 - 48;
  for (const c of d.clients) {
    const locIds = new Set(d.locations.filter((l) => l.client_id === c.id).map((l) => l.id));
    const cf = d.findings.filter((f) => locIds.has(f.location_id));
    const cdone = cf.filter((f) => f.status === "done").length;
    const cprog = cf.filter((f) => f.status === "in_progress").length;
    const cgather = cf.filter((f) => f.status === "gathering_evidence").length;
    const cpct = cf.length ? Math.round((cdone / cf.length) * 100) : 0;
    const ccrit = cf.filter((f) => f.severity === "critical" && f.status !== "done").length;
    const chigh = cf.filter((f) => f.severity === "high" && f.status !== "done").length;

    if (py > H - 80) { doc.addPage(); pageHeader(doc, "Progress by client (cont.)", M, W); cardBg(doc, M, 100, W - M * 2, H - 100 - M); py = 130; }

    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...C.ink);
    doc.text(c.name, innerX, py);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...C.muted);
    doc.text(`${locIds.size} sites · ${cf.length} findings`, innerX, py + 14);

    // Progress bar
    const barX = innerX, barY = py + 24, barW = innerW - 240, barH = 12;
    setFill(doc, [235, 238, 243]);
    doc.roundedRect(barX, barY, barW, barH, 4, 4, "F");
    setFill(doc, C.success);
    doc.roundedRect(barX, barY, (cpct / 100) * barW, barH, 4, 4, "F");
    if (cprog > 0 && cf.length > 0) {
      setFill(doc, C.primary);
      const sx = barX + (cdone / cf.length) * barW;
      const sw = (cprog / cf.length) * barW;
      doc.roundedRect(sx, barY, sw, barH, 4, 4, "F");
    }
    if (cgather > 0 && cf.length > 0) {
      setFill(doc, C.evidence);
      const sx = barX + ((cdone + cprog) / cf.length) * barW;
      const sw = (cgather / cf.length) * barW;
      doc.roundedRect(sx, barY, sw, barH, 4, 4, "F");
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...C.ink);
    doc.text(`${cpct}%`, barX + barW + 12, barY + 10);

    // Severity chips on right
    const chipX = barX + barW + 60;
    chip(doc, chipX, barY - 1, "Critical", String(ccrit), ccrit > 0 ? C.danger : C.muted);
    chip(doc, chipX + 90, barY - 1, "High", String(chigh), chigh > 0 ? SEV_COLOR.high : C.muted);

    py += 60;
  }

  // ---------- PAGE 4: Control health heatmap ----------
  doc.addPage();
  pageHeader(doc, "Control health by site", M, W);

  // Build matrix (only controls applicable somewhere)
  const controlSites = new Map<string, Set<string>>();
  for (const c of d.controls) {
    const set = new Set<string>();
    if (c.applies_to_all) for (const l of d.locations) set.add(l.id);
    else for (const link of d.links) if (link.control_id === c.id) set.add(link.location_id);
    controlSites.set(c.id, set);
  }
  const visibleControls = d.controls
    .filter((c) => (controlSites.get(c.id)?.size ?? 0) > 0)
    .sort((a, b) => ctrlLabel(a.id).localeCompare(ctrlLabel(b.id)));

  // Group locations by client for nice column blocks
  const orderedLocs = d.clients.flatMap((c) => d.locations.filter((l) => l.client_id === c.id));

  const heatTop = 110;
  const labelColW = 200;
  const cellH = 16;
  const headerH = 60;
  const heatX = M;
  const heatY = heatTop;
  const heatW = W - M * 2;
  const cellW = (heatW - labelColW) / Math.max(1, orderedLocs.length);

  // Legend
  const legY = heatY - 16;
  legendDot(doc, W - M - 220, legY, C.success, "Healthy");
  legendDot(doc, W - M - 140, legY, C.warn, "Open low/med");
  legendDot(doc, W - M - 60, legY, C.danger, "Open high/critical");

  // Column headers (client groups + site name)
  let colX = heatX + labelColW;
  let curClient = "";
  let groupStartX = colX;
  for (let i = 0; i < orderedLocs.length; i++) {
    const loc = orderedLocs[i];
    const cl = clientById.get(loc.client_id);
    if (cl?.name !== curClient) {
      // close previous group
      if (curClient) {
        setFill(doc, C.bg);
        doc.rect(groupStartX, heatY, colX - groupStartX, 22, "F");
        doc.setTextColor(...C.muted); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.text(curClient, groupStartX + 4, heatY + 14);
      }
      curClient = cl?.name ?? "";
      groupStartX = colX;
    }
    // site label rotated
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.ink);
    const label = truncate(loc.name, 18);
    doc.text(label, colX + cellW / 2, heatY + headerH - 4, { angle: 60, align: "left" });
    colX += cellW;
  }
  // last group
  if (curClient) {
    setFill(doc, C.bg);
    doc.rect(groupStartX, heatY, colX - groupStartX, 22, "F");
    doc.setTextColor(...C.muted); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(curClient, groupStartX + 4, heatY + 14);
  }

  // Rows
  let heatRowY = heatY + headerH;
  for (const c of visibleControls) {
    if (heatRowY + cellH > H - M) {
      // continue on a new page
      doc.addPage();
      pageHeader(doc, "Control health by site (cont.)", M, W);
      heatRowY = heatTop;
    }
    // Label
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.ink);
    doc.text(truncate(ctrlLabel(c.id), 50), heatX + 4, heatRowY + 11);

    // Cells
    for (let i = 0; i < orderedLocs.length; i++) {
      const loc = orderedLocs[i];
      const x = heatX + labelColW + i * cellW;
      const sites = controlSites.get(c.id);
      let color: [number, number, number] = [240, 242, 245];
      let mark = "";
      if (sites?.has(loc.id)) {
        const cf = d.findings.filter((f) => f.control_id === c.id && f.location_id === loc.id);
        const open = cf.filter((f) => f.status !== "done");
        if (cf.length === 0 || open.length === 0) {
          color = [...C.success].map((v) => Math.min(255, v + 80)) as [number, number, number];
          mark = "";
        } else {
          const severe = open.some((f) => f.severity === "critical" || f.severity === "high");
          color = severe ? C.danger : C.warn;
          mark = `${open.length}`;
        }
      }
      setFill(doc, color);
      doc.roundedRect(x + 1, heatRowY + 1, cellW - 2, cellH - 2, 2, 2, "F");
      if (mark) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...C.white);
        doc.text(mark, x + cellW / 2, heatRowY + 11, { align: "center" });
      }
    }
    heatRowY += cellH;
  }

  // ---------- PAGE: Top open findings ----------
  doc.addPage();
  pageHeader(doc, "Top open findings", M, W);

  const topOpen = d.findings
    .filter((f) => f.status !== "done")
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
    .slice(0, 25);

  autoTable(doc, {
    startY: 100,
    margin: { left: M, right: M },
    head: [["Severity", "Status", "Client · Site", "Control", "Finding"]],
    body: topOpen.map((f) => {
      const loc = locById.get(f.location_id);
      const cl = loc ? clientById.get(loc.client_id) : null;
      return [
        f.severity.toUpperCase(),
        statusLabel(f.status),
        `${cl?.name ?? "—"} · ${loc?.name ?? "—"}`,
        ctrlLabel(f.control_id),
        f.title,
      ];
    }),
    styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak" },
    headStyles: { fillColor: C.ink, textColor: C.white },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      1: { cellWidth: 70 },
      2: { cellWidth: 160 },
      3: { cellWidth: 180 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const sev = topOpen[data.row.index].severity;
        data.cell.styles.textColor = SEV_COLOR[sev];
      }
    },
  });

  // ---------- Footer ----------
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.line); doc.setLineWidth(0.5);
    doc.line(M, H - 28, W - M, H - 28);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.muted);
    doc.text("Audit remediation report", M, H - 14);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 14, { align: "right" });
  }

  doc.save(`audit-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ---------- helpers ----------
function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }
function sevRank(s: FindingSeverity) { return { critical: 4, high: 3, medium: 2, low: 1 }[s]; }
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function statusLabel(s: string): string {
  return ({ todo: "To do", in_progress: "In progress", gathering_evidence: "Gathering evidence", done: "Done" } as Record<string, string>)[s] ?? s;
}

function pageHeader(doc: jsPDF, title: string, M: number, W: number) {
  doc.setTextColor(...C.muted);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("AUDIT REMEDIATION", M, 40);
  doc.setDrawColor(...C.primary); doc.setLineWidth(2);
  doc.line(M, 46, M + 50, 46);
  doc.setTextColor(...C.ink);
  doc.setFontSize(22);
  doc.text(title, M, 76);
  doc.setDrawColor(...C.line); doc.setLineWidth(0.5);
  doc.line(M, 88, W - M, 88);
}

function cardBg(doc: jsPDF, x: number, y: number, w: number, h: number) {
  setFill(doc, C.bg);
  doc.roundedRect(x, y, w, h, 6, 6, "F");
}

function cardTitle(doc: jsPDF, t: string, x: number, y: number) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...C.ink);
  doc.text(t, x, y);
}

function kpiCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, color: [number, number, number], sub?: string,
) {
  cardBg(doc, x, y, w, h);
  setFill(doc, color);
  doc.rect(x, y, 4, h, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...C.muted);
  doc.text(label.toUpperCase(), x + 16, y + 22);
  doc.setFont("helvetica", "bold"); doc.setFontSize(28); doc.setTextColor(...C.ink);
  doc.text(value, x + 16, y + 56);
  if (sub) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(color[0], color[1], color[2]);
    doc.text(sub, x + w - 16, y + 56, { align: "right" });
  }
}

function chip(doc: jsPDF, x: number, y: number, label: string, value: string, color: [number, number, number]) {
  setFill(doc, [color[0], color[1], color[2]]);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.roundedRect(x, y, 80, 18, 4, 4, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...C.white);
  doc.text(`${label.toUpperCase()}  ${value}`, x + 40, y + 12, { align: "center" });
}

function legendDot(doc: jsPDF, x: number, y: number, color: [number, number, number], label: string) {
  setFill(doc, color); doc.circle(x + 5, y + 5, 5, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.muted);
  doc.text(label, x + 14, y + 8);
}

// Donut chart: segments sum to total
function drawDonut(
  doc: jsPDF, cx: number, cy: number, rOuter: number, rInner: number,
  segments: { value: number; color: [number, number, number] }[],
) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  if (total === 0) {
    setFill(doc, [230, 233, 238]);
    doc.circle(cx, cy, rOuter, "F");
    setFill(doc, C.bg);
    doc.circle(cx, cy, rInner, "F");
    return;
  }
  let startAngle = -Math.PI / 2;
  for (const seg of segments) {
    if (seg.value <= 0) continue;
    const sweep = (seg.value / total) * Math.PI * 2;
    fillArc(doc, cx, cy, rOuter, startAngle, startAngle + sweep, seg.color);
    startAngle += sweep;
  }
  setFill(doc, C.bg);
  doc.circle(cx, cy, rInner, "F");
}

// Approximate filled arc using triangle fan
function fillArc(
  doc: jsPDF, cx: number, cy: number, r: number,
  a0: number, a1: number, color: [number, number, number],
) {
  setFill(doc, color);
  doc.setDrawColor(color[0], color[1], color[2]);
  const steps = Math.max(8, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 64));
  for (let i = 0; i < steps; i++) {
    const t0 = a0 + ((a1 - a0) * i) / steps;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / steps;
    const x0 = cx + Math.cos(t0) * r;
    const y0 = cy + Math.sin(t0) * r;
    const x1 = cx + Math.cos(t1) * r;
    const y1 = cy + Math.sin(t1) * r;
    doc.triangle(cx, cy, x0, y0, x1, y1, "F");
  }
}

// Progress ring: fill arc 0..pct% with color, rest with bg
function drawRing(
  doc: jsPDF, cx: number, cy: number, r: number, pct: number,
  color: [number, number, number], bg: [number, number, number],
) {
  fillArc(doc, cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, bg);
  if (pct > 0) {
    fillArc(doc, cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * Math.PI * 2, color);
  }
  setFill(doc, C.ink);
  doc.circle(cx, cy, r * 0.62, "F");
}
