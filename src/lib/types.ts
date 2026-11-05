export type FindingStatus = "todo" | "in_progress" | "gathering_evidence" | "done";
export type FindingSeverity = "low" | "medium" | "high" | "critical";

export interface Client {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Location {
  id: string;
  client_id: string;
  name: string;
  created_at: string;
}

export interface ControlCatalog {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Control {
  id: string;
  name: string;
  catalog_id: string | null;
  implementation_notes: string | null;
  applies_to_all: boolean;
  created_at: string;
}

export interface ControlRequirement {
  id: string;
  control_id: string;
  title: string | null;
  text: string;
  source_party: string | null;
  source_name: string | null;
  source_department: string | null;
  source_document: string | null;
  created_at: string;
  updated_at: string;
}

export interface Finding {
  id: string;
  control_id: string;
  location_id: string;
  title: string;
  description: string | null;
  severity: FindingSeverity;
  status: FindingStatus;
  assignee: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface RemediationPlan {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  status: FindingStatus;
  assignee: string | null;
  due_date: string | null;
  effort_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface RemediationPlanFinding {
  plan_id: string;
  finding_id: string;
  created_at: string;
}

export interface RemediationStep {
  id: string;
  plan_id: string;
  description: string;
  done: boolean;
  position: number;
  created_at: string;
}

export interface Comment {
  id: string;
  plan_id: string;
  author: string | null;
  body: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  plan_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export const STATUSES: { value: FindingStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "gathering_evidence", label: "Gathering evidence" },
  { value: "done", label: "Done" },
];

export const SEVERITIES: FindingSeverity[] = ["low", "medium", "high", "critical"];
