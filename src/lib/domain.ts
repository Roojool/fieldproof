/**
 * FieldProof — deterministic bounded plan checker and repair proposer.
 *
 * Pure functions over a Workspace snapshot: no clock, no randomness, no I/O.
 * The same input always produces the same result (including evidence paths).
 *
 * Matching rules (from the fictional FieldProof field-service spec):
 *  - A high-risk work order is covered only when its assigned technician holds
 *    every required certification valid at the start of the work order's
 *    shift window. Missing or expired coverage is a finding, never guessed.
 *  - One part unit cannot be reserved for two work orders whose windows
 *    conflict; single-unit parts create a hard resource conflict.
 *  - Unknown certification requirements on legacy assets surface truthfully as
 *    unknowns: the work order is blocked until clarified, never auto-assigned.
 *  - A technician may not exceed maxConsecutiveShifts across the checked
 *    windows; this is used as rejection evidence for backup candidates.
 *
 * The scheduler is deterministic: candidate windows/technicians are evaluated
 * in stable id order and the first legal repair wins.
 */
import type {
  Analysis,
  CheckResult,
  Finding,
  Proposal,
  RepairChange,
  RejectedCandidate,
  Workspace,
  WorkspaceEdit,
} from './types';

/** Hard bound so the checker always terminates on large snapshots. */
export const MAX_WORK_ORDERS = 50;

/** A certification is valid for a window when its expiry is not before the window start. */
function certValidAt(validUntil: string, windowStart: string): boolean {
  return validUntil >= windowStart;
}

/** Parse an ISO-8601 instant to a comparable epoch-ms number. NaN if unparseable. */
function instantMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
}

/** Do two shift windows overlap (end-exclusive)? */
function windowsOverlap(a: ShiftWindowLike, b: ShiftWindowLike): boolean {
  return instantMs(a.start) < instantMs(b.end) && instantMs(b.start) < instantMs(a.end);
}

interface ShiftWindowLike {
  id: string;
  start: string;
  end: string;
}

interface TechCert {
  certificationId: string;
  validUntil: string;
}

/** Index: technicianId -> certificationId -> validUntil. */
function buildCertIndex(technicians: Workspace['technicians']): Map<string, Map<string, string>> {
  const index = new Map<string, Map<string, string>>();
  for (const tech of technicians) {
    const certs = new Map<string, string>();
    for (const h of tech.certifications) certs.set(h.certificationId, h.validUntil);
    index.set(tech.id, certs);
  }
  return index;
}

/** Index: certificationId -> set of technician ids that hold it. */
function buildCertHolders(technicians: Workspace['technicians']): Map<string, Set<string>> {
  const holders = new Map<string, Set<string>>();
  for (const tech of technicians) {
    for (const h of tech.certifications) {
      let set = holders.get(h.certificationId);
      if (!set) { set = new Set(); holders.set(h.certificationId, set); }
      set.add(tech.id);
    }
  }
  return holders;
}

interface OrderContext {
  order: Workspace['workOrders'][number];
  siteName: string;
  assetName: string;
  window: Workspace['windows'][number];
  requiredCerts: Workspace['certifications'][number][];
  assignedTech: Workspace['technicians'][number] | null;
}

function buildOrderContexts(workspace: Workspace): OrderContext[] {
  const sitesById = new Map(workspace.sites.map((s) => [s.id, s]));
  const assetsById = new Map(workspace.assets.map((a) => [a.id, a]));
  const windowsById = new Map(workspace.windows.map((w) => [w.id, w]));
  const certsById = new Map(workspace.certifications.map((c) => [c.id, c]));
  const techsById = new Map(workspace.technicians.map((t) => [t.id, t]));
  const contexts: OrderContext[] = [];
  for (const order of workspace.workOrders) {
    const site = sitesById.get(order.siteId);
    const asset = assetsById.get(order.assetId);
    const window = windowsById.get(order.windowId);
    const requiredCerts = order.requiredCertificationIds
      .map((cid) => certsById.get(cid))
      .filter((c): c is Workspace['certifications'][number] => Boolean(c));
    const assignedTech = order.assignedTechnicianId ? techsById.get(order.assignedTechnicianId) ?? null : null;
    contexts.push({
      order, siteName: site?.name ?? order.siteId, assetName: asset?.name ?? order.assetId,
      window: window ?? { id: order.windowId, label: order.windowId, day: 0, start: '', end: '' },
      requiredCerts, assignedTech,
    });
  }
  return contexts.sort((a, b) => a.order.id.localeCompare(b.order.id));
}

function evidencePath(site: string, asset: string, order: string, cert: string | null, tech: string | null): string[] {
  return [site, asset, order, cert ?? '', tech ?? ''].filter(Boolean);
}

/**
 * Check whether the plan (optionally with repair `changes` applied) covers every
 * work order. Deterministic and bounded; never mutates the input.
 */
export function checkPlan(workspace: Workspace, changes: WorkspaceEdit[] = []): CheckResult {
  const findings: Finding[] = [];
  if (workspace.workOrders.length > MAX_WORK_ORDERS) {
    return {
      ok: false,
      checkedAtRevision: workspace.revision,
      findings: [{
        id: 'finding-bound',
        severity: 'critical',
        code: 'too_many_work_orders',
        message: `Workspace has ${workspace.workOrders.length} work orders; the bounded checker supports at most ${MAX_WORK_ORDERS}.`,
        evidencePath: [],
      }],
    };
  }

  const certIndex = buildCertIndex(workspace.technicians);
  const certHolders = buildCertHolders(workspace.technicians);
  const windowsById = new Map(workspace.windows.map((w) => [w.id, w]));
  const techsById = new Map(workspace.technicians.map((t) => [t.id, t]));
  const partsById = new Map(workspace.parts.map((p) => [p.id, p]));

  // Apply repair changes logically (non-mutating) to evaluate the resulting plan.
  // clarify-unknown is a "block until clarified" proposal, not a plan change — skip it here.
  const ordersById = new Map(workspace.workOrders.map((o) => [o.id, o]));
  const modifiedOrders = new Map(ordersById);
  for (const change of changes) {
    if (change.kind === 'clarify-unknown') continue;
    const order = modifiedOrders.get(change.workOrderId);
    if (!order) continue;
    const next: typeof order = { ...order };
    if (change.kind === 'reschedule' && change.windowId) next.windowId = change.windowId;
    if (change.kind === 'assign-technician' && change.technicianId) next.assignedTechnicianId = change.technicianId;
    modifiedOrders.set(order.id, next);
  }

  const contexts = buildOrderContexts({
    ...workspace,
    workOrders: [...modifiedOrders.values()],
  });

  // Track per-technician assigned windows to enforce maxConsecutiveShifts.
  const techAssignedWindows = new Map<string, string[]>();
  for (const ctx of contexts) {
    if (ctx.assignedTech) {
      let list = techAssignedWindows.get(ctx.assignedTech.id);
      if (!list) { list = []; techAssignedWindows.set(ctx.assignedTech.id, list); }
      list.push(ctx.window.id);
    }
  }

  // 1. Coverage check per work order.
  for (const ctx of contexts) {
    const { order, window, requiredCerts, assignedTech } = ctx;
    const path = evidencePath(ctx.siteName, ctx.assetName, order.id, null, null);

    // Unknown requirement: an asset with no recorded cert requirement but flagged unknown.
    const unknown = workspace.unknowns.find((u) => u.assetId === order.assetId);

    if (!assignedTech) {
      findings.push({
        id: `finding-unassigned-${order.id}`,
        severity: 'critical',
        code: 'unassigned',
        message: `"${order.title}" (${order.id}) at ${ctx.siteName} has no technician assigned; it cannot be dispatched.`,
        evidencePath: [...path, order.id],
      });
      continue;
    }

    // Consecutive-shift policy for the assigned technician.
    const assignedWindows = (techAssignedWindows.get(assignedTech.id) ?? []).map((wid) => windowsById.get(wid)).filter(Boolean);
    const consecutiveCount = assignedWindows.length;
    if (consecutiveCount > assignedTech.maxConsecutiveShifts) {
      findings.push({
        id: `finding-consecutive-${order.id}`,
        severity: 'critical',
        code: 'max_consecutive_shifts',
        message: `${assignedTech.name} (${assignedTech.id}) is assigned ${consecutiveCount} shift(s) exceeding the max-consecutive-shifts policy of ${assignedTech.maxConsecutiveShifts}.`,
        evidencePath: [...path, assignedTech.id],
      });
    }

    // Each required certification must be held and valid at window start.
    let missingOrExpired = false;
    for (const cert of requiredCerts) {
      const validUntil = certIndex.get(assignedTech.id)?.get(cert.id);
      if (!validUntil || !certValidAt(validUntil, window.start)) {
        missingOrExpired = true;
        findings.push({
          id: `finding-cert-${order.id}-${cert.id}`,
          severity: 'critical',
          code: 'cert_not_valid',
          message: `${assignedTech.name} does not hold a valid "${cert.name}" for "${order.title}" (${order.id}) in window "${window.label}" (starts ${window.start}).`,
          evidencePath: [...path, cert.id, assignedTech.id],
        });
      }
    }

    if (unknown && !missingOrExpired && assignedTech) {
      // Even if coverage holds, an unknown requirement blocks dispatch until clarified.
      findings.push({
        id: `finding-unknown-${order.id}`,
        severity: 'warning',
        code: 'unknown_requirement',
        message: `${ctx.assetName} at ${ctx.siteName} has an unknown certification requirement ("${unknown.note}"); ${order.id} is blocked until clarified.`,
        evidencePath: [...path],
      });
    }
  }

  // 2. Part conflicts: single-unit part reserved for two conflicting work orders.
  const partOrders = new Map<string, string[]>();
  for (const ctx of contexts) {
    for (const pid of ctx.order.partIds) {
      let list = partOrders.get(pid);
      if (!list) { list = []; partOrders.set(pid, list); }
      list.push(ctx.order.id);
    }
  }
  for (const [pid, orderIds] of partOrders) {
    const part = partsById.get(pid);
    if (!part || part.quantity >= 2) continue;
    for (let i = 0; i < orderIds.length; i++) {
      for (let j = i + 1; j < orderIds.length; j++) {
        const a = modifiedOrders.get(orderIds[i])!;
        const b = modifiedOrders.get(orderIds[j])!;
        const wa = windowsById.get(a.windowId);
        const wb = windowsById.get(b.windowId);
        if (wa && wb && windowsOverlap(wa, wb)) {
          findings.push({
            id: `finding-part-${pid}-${orderIds[i]}-${orderIds[j]}`,
            severity: 'critical',
            code: 'part_conflict',
            message: `Part "${part.name}" (${pid}, ${part.quantity} unit) is reserved for both "${a.title}" (${a.id}) and "${b.title}" (${b.id}) in overlapping windows; only one can be equipped.`,
            evidencePath: [part.id, a.id, b.id],
          });
        }
      }
    }
  }

  const ok = findings.every((f) => f.severity !== 'critical');
  return { ok, checkedAtRevision: workspace.revision, findings };
}

interface RepairOptions {
  orderId: string;
  toWindowId?: string;
  toTechnicianId?: string;
}

function findLegalWindows(
  workspace: Workspace,
  orderId: string,
  certIndex: Map<string, Map<string, string>>,
  certHolders: Map<string, Set<string>>,
  windowsById: Map<string, Workspace['windows'][number]>,
): string[] {
  const order = [...workspace.workOrders].find((o) => o.id === orderId);
  if (!order) return [];
  const legal: string[] = [];
  for (const win of workspace.windows) {
    let allCovered = true;
    for (const certId of order.requiredCertificationIds) {
      const holders = certHolders.get(certId);
      if (!holders) { allCovered = false; break; }
      let anyValid = false;
      for (const techId of holders) {
        const validUntil = certIndex.get(techId)?.get(certId);
        if (validUntil && certValidAt(validUntil, win.start)) { anyValid = true; break; }
      }
      if (!anyValid) { allCovered = false; break; }
    }
    if (allCovered) legal.push(win.id);
  }
  return legal.sort((a, b) => a.localeCompare(b));
}

/**
 * Deterministic repair proposals for the current snapshot. Never mutates the
 * input workspace. Emits reschedule proposals, rejected backup candidates with
 * evidence, approval-fact unlocks, and clarify-unknown proposals.
 */
export function proposeRepairs(workspace: Workspace): Proposal[] {
  const base = checkPlan(workspace);
  if (base.ok) return [];

  const certIndex = buildCertIndex(workspace.technicians);
  const certHolders = buildCertHolders(workspace.technicians);
  const windowsById = new Map(workspace.windows.map((w) => [w.id, w]));
  const techsById = new Map(workspace.technicians.map((t) => [t.id, t]));

  const proposals: Proposal[] = [];

  // Unknown-requirement proposals first: clarify before any assignment.
  for (const finding of base.findings) {
    if (finding.code !== 'unknown_requirement') continue;
    const assetId = finding.evidencePath[0];
    const unknown = workspace.unknowns.find((u) => u.assetId === assetId);
    if (!unknown) continue;
    const orderId = finding.evidencePath.find((id) => workspace.workOrders.some((o) => o.id === id));
    const changes: RepairChange[] = orderId ? [{ kind: 'clarify-unknown', assetId, certificationIds: [], note: unknown.note }] : [];
    proposals.push({
      id: `pr-${stableId('clarify', assetId)}`,
      title: `Clarify certification requirement for ${unknown.assetId}`,
      summary: `${unknown.assetId}: ${unknown.note}. The affected work order stays blocked until a certified technician is confirmed.`,
      valid: true,
      changes,
      rejectedCandidates: [],
      unlocksOriginalDeadline: false,
    });
  }

  // Reschedule proposals for expired/missing certification on the assigned technician.
  for (const finding of base.findings) {
    if (finding.code !== 'cert_not_valid') continue;
    // evidencePath: [site, asset, order, cert, tech]
    const orderId = finding.evidencePath[2];
    const techId = finding.evidencePath[4];
    const order = [...workspace.workOrders].find((o) => o.id === orderId);
    const tech = techsById.get(techId);
    const win = order ? windowsById.get(order.windowId) : undefined;
    if (!order || !tech || !win) continue;

    const legalWindows = findLegalWindows(workspace, orderId, certIndex, certHolders, windowsById);
    // Candidate: move to the earliest legal window strictly after the current one.
    const currentIdx = workspace.windows.findIndex((w) => w.id === order.windowId);
    const targetWindow = legalWindows.find((wid) => {
      const w = windowsById.get(wid);
      return w && currentIdx >= 0 && instantMs(w.start) > instantMs(win.start);
    });

    if (targetWindow) {
      const changes: RepairChange[] = [{ kind: 'reschedule', workOrderId: orderId, fromWindowId: order.windowId, toWindowId: targetWindow }];
      const target = windowsById.get(targetWindow)!;
      proposals.push({
        id: `pr-${stableId('reschedule', orderId, targetWindow)}`,
        title: `Move "${order.title}" to ${target.label}`,
        summary: `${tech.name}'s certification is not valid for ${order.title} (${order.id}) in ${win.label}. Move to ${target.label} (${target.start}) where a certified technician is available.`,
        valid: true,
        changes,
        rejectedCandidates: [],
        unlocksOriginalDeadline: false,
      });
    }

    // Rejected backup candidates: technicians who cannot legally cover.
    for (const candidate of [...workspace.technicians].sort((a, b) => a.id.localeCompare(b.id))) {
      if (candidate.id === techId) continue;
      const holdsAll = order.requiredCertificationIds.every((cid) => {
        const validUntil = certIndex.get(candidate.id)?.get(cid);
        return Boolean(validUntil && certValidAt(validUntil, win.start));
      });
      if (holdsAll) continue; // legally eligible — not a rejection
      const reasons: string[] = [];
      for (const cid of order.requiredCertificationIds) {
        const validUntil = certIndex.get(candidate.id)?.get(cid);
        if (!validUntil || !certValidAt(validUntil, win.start)) {
          const cert = workspace.certifications.find((c) => c.id === cid);
          reasons.push(`does not hold a valid "${cert?.name ?? cid}" for ${win.label}`);
        }
      }
      // Consecutive-shift evidence.
      const assignedWindows = [...workspace.workOrders]
        .filter((o) => o.assignedTechnicianId === candidate.id)
        .map((o) => windowsById.get(o.windowId))
        .filter(Boolean);
      if (assignedWindows.length + 1 > candidate.maxConsecutiveShifts) {
        reasons.push(`would exceed max-consecutive-shifts policy (${candidate.maxConsecutiveShifts})`);
      }
      proposals.push({
        id: `pr-${stableId('reject', orderId, candidate.id)}`,
        title: `Rejected: ${candidate.name} for "${order.title}"`,
        summary: `Backup candidate ${candidate.name} considered and rejected: ${reasons.join('; ')}. A new approval fact would re-open this option.`,
        valid: false,
        invalidReason: reasons.join('; '),
        changes: [{ kind: 'assign-technician', workOrderId: orderId, fromTechnicianId: techId, toTechnicianId: candidate.id }],
        rejectedCandidates: [{ technicianId: candidate.id, reasonCode: 'not_eligible', reason: reasons.join('; ') }],
        unlocksOriginalDeadline: false,
      });
    }
  }

  // Approval fact: "dana-renewal-completed-early" unlocks the original deadline.
  const hasExpiredCertFinding = base.findings.some((f) => f.code === 'cert_not_valid');
  if (hasExpiredCertFinding && proposals.length === 0) {
    proposals.push({
      id: `pr-${stableId('approval', 'unlock-original')}`,
      title: 'Approval: cert renewal completed early',
      summary: 'If the technician\'s certification renewal is confirmed as completed early, the original shift window is re-enabled without rescheduling.',
      valid: true,
      changes: [],
      rejectedCandidates: [],
      unlocksOriginalDeadline: true,
      requiresApprovalFact: 'dana-renewal-completed-early',
    });
  }

  return proposals;
}

/** Stable 8-hex FNV-1a digest so proposal ids are deterministic across runs. */
export function stableId(...parts: string[]): string {
  const input = parts.join('\u0000');
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Analysis assembler used by the graph layer. */
export function buildAnalysis(workspace: Workspace): Analysis {
  return {
    workspaceRevision: workspace.revision,
    check: checkPlan(workspace),
    proposals: proposeRepairs(workspace),
  };
}
