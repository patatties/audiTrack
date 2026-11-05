// Fictional demo data set for audiTrack. Every client, location, person and finding here
// is invented; nothing is taken from real customer data. It is loaded only when the user
// picks "Load demo data" on an empty database (see routes/setup.js).
// Dates are relative to the moment of loading, so the dashboard always looks current.

import { BASELINE_SETS, SOLUTION_TEMPLATES } from "./templates.js";
import { emptyCounts, insertClients, insertControls, insertSolutions } from "./apply.js";

const CLIENTS = [
  {
    name: "Lindqvist Freight",
    description: "Demo client — road and sea freight forwarder, about 400 employees, own port terminal.",
    locations: ["Rotterdam port terminal", "Venlo distribution centre", "Head office"],
  },
  {
    name: "Meridian Care Group",
    description: "Demo client — regional healthcare provider with one hospital and several clinics.",
    locations: ["Main hospital", "Outpatient clinic East", "Shared IT services"],
  },
  {
    name: "Municipality of Oosterveen",
    description: "Demo client — small municipality, IT partly outsourced.",
    locations: ["Town hall", "Public works depot"],
  },
  {
    name: "Copperleaf Software",
    description: "Demo client — SaaS company running a B2B platform in the public cloud.",
    locations: ["Cloud platform", "Engineering"],
  },
];

// Controls that apply everywhere; all others are linked to the locations that have findings.
const APPLIES_TO_ALL = new Set(["GV-01", "GV-02", "GV-03", "PR-12", "PR-01", "PR-02", "PR-06", "PR-08", "PR-11", "RS-01"]);

// [ref, client, location, control, severity, status, assignee, due (days from now), created (days ago), title, description]
const FINDINGS = [
  ["f1", "Lindqvist Freight", "Rotterdam port terminal", "PR-10", "critical", "in_progress", "Erik Vos", 21, 40,
    "Terminal OT network not separated from office LAN",
    "Crane control and gate systems share the office VLAN. A compromised office workstation can reach the PLC management interfaces directly."],
  ["f2", "Lindqvist Freight", "Rotterdam port terminal", "PR-16", "high", "todo", "Lotte de Graaf", 14, 12,
    "Server room door propped open during shifts",
    "During the walk-through the technical room was open and unattended for over 30 minutes. Badge logs show no entries for that period."],
  ["f3", "Lindqvist Freight", "Venlo distribution centre", "PR-06", "high", "in_progress", "Erik Vos", -5, 55,
    "Warehouse scanners run outdated firmware",
    "62 of 140 handheld scanners run firmware with known vulnerabilities. There is no update process for these devices."],
  ["f4", "Lindqvist Freight", "Venlo distribution centre", "PR-11", "medium", "gathering_evidence", "Tom Hendriks", 7, 60,
    "Warehouse management backups never restore-tested",
    "Nightly backups of the warehouse management system succeed, but no restore has ever been tested. The real recovery time is unknown."],
  ["f5", "Lindqvist Freight", "Head office", "PR-01", "high", "done", "Sanne Bakker", -20, 90,
    "Leavers keep access to transport planning system",
    "Seven accounts of employees who left in the last six months were still active in the planning system."],
  ["f6", "Lindqvist Freight", "Head office", "GV-04", "medium", "todo", "Sanne Bakker", 45, 20,
    "No security clauses in contract with fuel card provider",
    "The fuel card provider processes driver data, but the contract contains no security requirements or breach notification clause."],
  ["f7", "Lindqvist Freight", "Head office", "PR-02", "critical", "done", "Tom Hendriks", -30, 100,
    "MFA not enforced for webmail",
    "The conditional access policy only covered VPN; webmail and the customer portal accepted password-only sign-in."],
  ["f8", "Lindqvist Freight", "Rotterdam port terminal", "DE-01", "medium", "todo", "Erik Vos", 30, 8,
    "Firewall logs kept locally for 7 days only",
    "Terminal firewall logs are not forwarded to the central log platform and are overwritten after a week."],

  ["f9", "Meridian Care Group", "Main hospital", "PR-03", "critical", "in_progress", "Priya Raman", 10, 35,
    "Shared admin account on imaging servers",
    "Three engineers of the imaging supplier use one shared local administrator account. Actions cannot be traced to a person."],
  ["f10", "Meridian Care Group", "Main hospital", "ID-03", "high", "todo", "Noor El Amrani", 60, 25,
    "Scanned referral letters kept beyond retention period",
    "A legacy file share holds about 1.2 TB of scanned referral letters, many older than the agreed retention period."],
  ["f11", "Meridian Care Group", "Main hospital", "PR-08", "high", "gathering_evidence", "Priya Raman", 3, 50,
    "EDR missing on 15 lab workstations",
    "Workstations connected to laboratory equipment were excluded from the EDR rollout because of vendor support concerns."],
  ["f12", "Meridian Care Group", "Outpatient clinic East", "PR-16", "medium", "done", "Noor El Amrani", -12, 70,
    "Screens with patient data visible from waiting area",
    "Two reception screens faced the waiting area and showed appointment lists with patient names."],
  ["f13", "Meridian Care Group", "Outpatient clinic East", "PR-12", "medium", "in_progress", "Daan Smit", 40, 30,
    "Phishing simulation: 18% click rate",
    "The last simulation showed 18% of clinic staff clicked the link and 6% entered credentials."],
  ["f14", "Meridian Care Group", "Shared IT services", "RC-01", "high", "todo", "Priya Raman", 35, 15,
    "Disaster recovery for patient records not tested in two years",
    "The DR plan for the patient record system exists, but the last failover test was two years ago and the environment has changed since."],
  ["f15", "Meridian Care Group", "Shared IT services", "RS-02", "medium", "done", "Noor El Amrani", -40, 120,
    "Data breach register incomplete",
    "Four reported incidents from last year were missing from the breach register; the assessment of the notification duty was not documented."],
  ["f16", "Meridian Care Group", "Shared IT services", "ID-04", "high", "todo", "Daan Smit", 20, 6,
    "Vulnerability scans exclude the DMZ",
    "The scan scope only covers internal ranges. Internet-facing systems in the DMZ have not been scanned this year."],

  ["f17", "Municipality of Oosterveen", "Town hall", "GV-03", "medium", "in_progress", "Lotte de Graaf", 25, 45,
    "Risk assessment out of date",
    "The information security risk assessment was last updated three years ago and does not cover the new cloud services."],
  ["f18", "Municipality of Oosterveen", "Town hall", "PR-04", "high", "todo", "Ruben Meijer", 14, 10,
    "Service account passwords stored in a spreadsheet",
    "Passwords for 23 service accounts are kept in a spreadsheet on the IT share, readable by all IT staff."],
  ["f19", "Municipality of Oosterveen", "Town hall", "ID-01", "low", "todo", "Ruben Meijer", 90, 18,
    "Asset register misses cloud applications",
    "The asset register lists on-premises systems only; at least eleven SaaS applications in use are missing."],
  ["f20", "Municipality of Oosterveen", "Public works depot", "PR-05", "critical", "todo", "Ruben Meijer", 7, 4,
    "Default password on pumping station control panel",
    "The control panel of the pumping station is reachable from the depot network and still uses the vendor default password."],
  ["f21", "Municipality of Oosterveen", "Public works depot", "PR-16", "low", "done", "Lotte de Graaf", -60, 150,
    "Depot gate badges not revoked on leaving",
    "Badges for the depot gate were managed manually and not revoked when staff left. The badge system is now linked to the HR leavers list."],
  ["f22", "Municipality of Oosterveen", "Town hall", "GV-07", "medium", "gathering_evidence", "Lotte de Graaf", 10, 38,
    "Processing register lacks legal basis for 9 activities",
    "Nine processing activities in the register have no documented legal basis or retention period."],

  ["f23", "Copperleaf Software", "Cloud platform", "PR-14", "medium", "in_progress", "Daan Smit", 18, 28,
    "No dependency scanning in CI pipeline",
    "Third-party packages are not scanned for known vulnerabilities before release."],
  ["f24", "Copperleaf Software", "Cloud platform", "PR-15", "high", "todo", "Tom Hendriks", 21, 9,
    "Production data copied unmasked to test",
    "The test environment is refreshed monthly with a full copy of production, including customer contact details."],
  ["f25", "Copperleaf Software", "Cloud platform", "DE-01", "low", "done", "Daan Smit", -8, 65,
    "Cloud audit logs retained for 30 days only",
    "Activity logs of the cloud tenant were kept for the default 30 days. Retention is now 12 months in a separate storage account."],
  ["f26", "Copperleaf Software", "Engineering", "PR-15", "medium", "todo", "Tom Hendriks", 30, 14,
    "Hotfixes deployed without change record",
    "Five hotfixes in the last quarter went to production without a change record or approval afterwards."],
  ["f27", "Copperleaf Software", "Engineering", "PR-03", "high", "in_progress", "Daan Smit", 12, 22,
    "Developers hold permanent owner rights on production",
    "All eight developers have permanent owner rights on the production subscription instead of time-limited elevation."],
  ["f28", "Copperleaf Software", "Cloud platform", "RS-01", "low", "todo", "Sanne Bakker", 75, 5,
    "Incident response plan never exercised",
    "The incident response plan was written last year but has not been exercised with the on-call team."],
];

// [code, title, status, assignee, due (days), effort days, findings, solutions, description, comments [author, days ago, text]]
const PLANS = [
  ["RP-001", "Segment the terminal OT network", "in_progress", "Erik Vos", 21, 15, ["f1", "f8"], ["SOL-SEGMENTATION", "SOL-LOGGING"],
    "Move crane control and gate systems to a dedicated OT zone with a firewall between office and OT.\n\nSteps:\n1. Inventory all OT devices and their communication needs.\n2. Create the OT VLAN and firewall policy (default deny).\n3. Migrate devices in two maintenance windows.\n4. Forward firewall logs to the central log platform.",
    [["Erik Vos", 20, "Inventory complete: 37 OT devices, 4 need vendor remote access."], ["Lotte de Graaf", 6, "First maintenance window approved for the 2nd weekend of next month."]]],
  ["RP-002", "Firmware management for warehouse scanners", "in_progress", "Erik Vos", -5, 6, ["f3"], ["SOL-PATCH"],
    "Bring all handheld scanners under central device management and roll out the current firmware in batches per shift.",
    [["Erik Vos", 15, "Vendor confirmed the MDM supports firmware push for this model."], ["Erik Vos", 2, "Batch 1 (40 devices) done. Batch 2 delayed by peak season — new date requested."]]],
  ["RP-003", "Access hygiene programme", "done", "Tom Hendriks", -20, 8, ["f5", "f7"], ["SOL-ACCESS-REVIEW", "SOL-MFA"],
    "Enforce MFA for all cloud access and introduce a half-yearly access review for the planning and finance systems.",
    [["Tom Hendriks", 45, "MFA enforced for all users; 3 legacy mail clients replaced."], ["Sanne Bakker", 22, "First access review completed, 7 accounts removed. Evidence uploaded."]]],
  ["RP-004", "Personal admin accounts for imaging supplier", "in_progress", "Priya Raman", 10, 4, ["f9"], ["SOL-ACCESS-REVIEW"],
    "Replace the shared supplier account with personal accounts in the privileged access vault, with session recording for supplier access.",
    [["Priya Raman", 9, "Supplier agreed; waiting for names of the three engineers."]]],
  ["RP-005", "Disaster recovery test for patient records", "todo", "Priya Raman", 35, 10, ["f14"], ["SOL-BACKUP"],
    "Plan and execute a failover test of the patient record system to the secondary data centre, measured against the agreed RTO of 8 hours.",
    []],
  ["RP-006", "Secrets vault and hardening for municipal IT", "todo", "Ruben Meijer", 14, 5, ["f18", "f20"], ["SOL-HARDENING"],
    "Move all service account passwords to a vault with rotation, and change default credentials on operational technology at the depot.",
    [["Ruben Meijer", 3, "Default password on the pumping station panel changed as an emergency measure; vault selection in progress."]]],
  ["RP-007", "Secure pipeline and test data", "in_progress", "Daan Smit", 30, 12, ["f23", "f24", "f26"], ["SOL-CHANGE"],
    "Add dependency scanning to the pipeline, mask personal data in test refreshes and require a change record for every production deployment.",
    [["Daan Smit", 12, "Dependency scanning enabled on the main repository; 14 findings triaged."], ["Tom Hendriks", 4, "Masking script ready for review."]]],
  ["RP-008", "Retention clean-up of legacy file share", "todo", "Noor El Amrani", 60, 8, ["f10"], ["SOL-RETENTION"],
    "Agree retention periods with the medical records department, then archive or delete scanned letters older than the retention period.",
    []],
];

const NOTES = [
  ["Walk-through Venlo DC — raw notes", 3, false,
    "- loading dock door to server cupboard has no lock\n- scanners: firmware versions vary, ask Erik for MDM status\n- guest wifi password on whiteboard in canteen\n- UPS for WMS server: battery replaced? no label\n- cameras ok, retention 14 days"],
  ["Interview IT coordinator Oosterveen", 6, false,
    "Outsourced helpdesk has domain admin rights. No review of their accounts since contract start.\nBackups go to a NAS in the same room as the servers.\nThey want to start with MFA for remote workers next quarter."],
  ["Follow-up list", 15, true,
    "Meridian: send DR test template to Priya\nCopperleaf: check change records Q3\nLindqvist: confirm evidence for access review"],
];

// [control, title, text, party, name, department, document]
const REQUIREMENTS = [
  ["PR-02", "Cyber insurance condition", "Multi-factor authentication must be active on all remote access and e-mail as a condition of the cyber insurance policy.", "Insurer", "Policy conditions", "Finance", "Cyber insurance policy schedule"],
  ["RS-02", "72-hour notification", "Personal data breaches must be reported to the supervisory authority within 72 hours of discovery, unless the breach is unlikely to result in a risk.", "Regulator", "GDPR", "Legal", "GDPR article 33"],
  ["RS-02", "Significant incident early warning", "Significant incidents must be reported to the competent authority with an early warning within 24 hours.", "Regulator", "NIS2", "Security office", "NIS2 directive article 23"],
  ["PR-11", "Offline backup of patient records", "Backups of patient records must include at least one offline or immutable copy, retained for at least 30 days.", "Client", "Meridian Care Group", "IT", "IT security baseline"],
];

const day = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * day).toISOString();
const date = (offsetDays) => iso(offsetDays).slice(0, 10);

export async function loadDemo(db) {
  const counts = emptyCounts();
  const { locationIds } = await insertClients(db, CLIENTS, counts);
  const loc = (client, location) => locationIds.get(`${client.toLowerCase()}|${location.toLowerCase()}`);

  const controls = BASELINE_SETS.flatMap((s) => s.controls).map((c) => ({ ...c, applies_to_all: APPLIES_TO_ALL.has(c.code) }));
  const controlIds = await insertControls(db, controls, counts);
  const ctrl = (code) => controlIds.get(code.toLowerCase());

  // Link location-specific controls to the locations where they have findings.
  for (const [, client, location, code] of FINDINGS) {
    if (APPLIES_TO_ALL.has(code)) continue;
    await db.query("INSERT INTO control_locations (control_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [ctrl(code), loc(client, location)]);
  }

  const solutionIds = await insertSolutions(db, SOLUTION_TEMPLATES, controlIds, counts);

  const findingIds = new Map();
  for (const [i, f] of FINDINGS.entries()) {
    const [ref, client, location, code, severity, status, assignee, due, created, title, description] = f;
    const res = await db.query(
      `INSERT INTO findings (control_id, location_id, title, description, severity, status, assignee, due_date, position, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [ctrl(code), loc(client, location), title, description, severity, status, assignee, date(due), i, iso(-created), iso(-Math.min(created, 2))]
    );
    findingIds.set(ref, res.rows[0].id);
    counts.findings++;
  }

  for (const [code, title, status, assignee, due, effort, findings, solutions, description, comments] of PLANS) {
    const res = await db.query(
      `INSERT INTO remediation_plans (code, title, description, status, assignee, due_date, effort_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [code, title, description, status, assignee, date(due), effort]
    );
    const planId = res.rows[0].id;
    counts.remediation_plans++;
    for (const ref of findings) {
      await db.query("INSERT INTO remediation_plan_findings (plan_id, finding_id) VALUES ($1, $2)", [planId, findingIds.get(ref)]);
    }
    for (const sol of solutions) {
      const solutionId = solutionIds.get(sol.toLowerCase());
      if (solutionId) await db.query("INSERT INTO solution_remediations (solution_id, plan_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [solutionId, planId]);
    }
    for (const [author, ago, body] of comments) {
      await db.query("INSERT INTO comments (plan_id, author, body, created_at) VALUES ($1, $2, $3, $4)", [planId, author, body, iso(-ago)]);
      counts.comments++;
    }
  }

  for (const [title, ago, processed, body] of NOTES) {
    await db.query("INSERT INTO notes (title, body, processed, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)", [title, body, processed, iso(-ago)]);
    counts.notes++;
  }

  for (const [code, title, text, party, name, department, document] of REQUIREMENTS) {
    await db.query(
      `INSERT INTO control_requirements (control_id, title, text, source_party, source_name, source_department, source_document)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ctrl(code), title, text, party, name, department, document]
    );
    for (const [field, value] of [["party", party], ["name", name], ["department", department], ["document", document]]) {
      await db.query("INSERT INTO requirement_sources (field, value) VALUES ($1, $2) ON CONFLICT DO NOTHING", [field, value]);
    }
    counts.requirements++;
  }

  return counts;
}
