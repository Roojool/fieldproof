// FieldProof domain types — single source of truth (see BUILD_CONTRACT.md).
// Mirrors the PACT contract surface: workspace / analyze / repair / approve / memory.
// All fixture data is fictional.

export type ScenarioId = "S1" | "S2" | "S3";

export interface ShiftWindow {
  id: string;
  label: string;
  day: number;
  start: string; // ISO-8601
  end: string; // ISO-8601
}

export interface Certification {
  id: string;
  name: string;
}

/** Technician-specific holding of a certification with its own expiry. */
export interface TechnicianCertification {
  certificationId: string;
  validUntil: string; // ISO-8601
}

export interface Technician {
  id: string;
  name: string;
  homeSiteId: string;
  certifications: TechnicianCertification[];
  maxConsecutiveShifts: number;
}

export interface Part {
  id: string;
  name: string;
  quantity: number;
  reservedForWorkOrderId: string | null;
}

export interface Site {
  id: string;
  name: string;
  region: string;
}

export type AssetCriticality = "high" | "medium" | "low";

export interface Asset {
  id: string;
  siteId: string;
  name: string;
  criticality: AssetCriticality;
}

export type WorkOrderStatus = "pending" | "scheduled" | "blocked" | "completed";

export interface WorkOrder {
  id: string;
  siteId: string;
  assetId: string;
  title: string;
  windowId: string;
  requiredCertificationIds: string[];
  partIds: string[];
  assignedTechnicianId: string | null;
  etaHours: number;
  status: WorkOrderStatus;
}

/** Legacy assets whose certification requirements are genuinely unknown — surfaced, never guessed. */
export interface UnknownRequirement {
  assetId: string;
  note: string;
}

export interface Workspace {
  id: string;
  revision: number;
  scenario: ScenarioId;
  createdAt: string; // ISO-8601
  sites: Site[];
  assets: Asset[];
  windows: ShiftWindow[];
  certifications: Certification[];
  technicians: Technician[];
  workOrders: WorkOrder[];
  parts: Part[];
  unknowns: UnknownRequirement[];
  sources?: string[];
}

export type FindingSeverity = "critical" | "warning" | "info";

export interface Finding {
  id: string;
  severity: FindingSeverity;
  code: string;
  message: string;
  /** Ordered node ids proving the multi-hop traversal (site -> asset -> work order -> cert -> technician). */
  evidencePath: string[];
}

export interface CheckResult {
  ok: boolean;
  checkedAtRevision: number;
  findings: Finding[];
  /** Human-readable summary of the check result. */
  summary?: string;
}

export type RepairKind = "reschedule" | "assign-technician" | "reserve-part" | "clarify-unknown";

export interface RepairChange {
  kind: RepairKind;
  workOrderId?: string;
  fromWindowId?: string;
  toWindowId?: string;
  fromTechnicianId?: string;
  toTechnicianId?: string;
  partId?: string;
  assetId?: string;
  certificationIds?: string[];
  note?: string;
}

export interface RejectedCandidate {
  technicianId: string;
  reasonCode: string;
  reason: string;
}

export interface Proposal {
  id: string;
  title: string;
  summary: string;
  valid: boolean;
  status?: string;
  invalidReason?: string;
  changes: RepairChange[];
  rejectedCandidates: RejectedCandidate[];
  unlocksOriginalDeadline: boolean;
  revision?: number;
  /** New fact that, once approved, re-enables the original deadline. */
  requiresApprovalFact?: string;
}

export interface Decision {
  id: string;
  proposalId: string;
  workspaceRevisionAfter: number;
  idempotencyKey: string;
  approvedAt: string; // ISO-8601
}

export type AgentMode = "live-groq" | "live-openrouter" | "deterministic";

export interface AgentReply {
  mode: AgentMode;
  text: string;
  createdAt: string; // ISO-8601
  warning?: string;
}

export interface Analysis {
  workspaceRevision: number;
  check: CheckResult;
  proposals: Proposal[];
  mode?: AgentMode;
  warning?: string;
}

export type WorkspaceEdit =
  | { kind: "assign-technician"; workOrderId: string; technicianId: string }
  | { kind: "reschedule"; workOrderId: string; windowId: string }
  | { kind: "reserve-part"; partId: string; workOrderId: string }
  | {
      kind: "clarify-unknown";
      assetId: string;
      certificationIds: string[];
      note: string;
    };
