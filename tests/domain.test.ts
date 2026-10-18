/**
 * FieldProof — deterministic domain unit tests (no database).
 *
 * Verifies checkPlan / proposeRepairs / buildAnalysis / stableId against the
 * S1/S2/S3 fixtures (see .commander/context/02_WAVE_1_FLAGSHIPS.md) and
 * hand-built edge cases. All data is fictional.
 *
 * Notes on the current implementation:
 *  - S2 work orders do not list the shared truck in partIds, so the domain's
 *    part-conflict path is not triggered by the S2 fixture; a dedicated test
 *    covers part_conflict with a custom workspace.
 *  - S3 wo-301 is unassigned, so checkPlan short-circuits on `unassigned` and
 *    never reaches the `unknown_requirement` branch; a dedicated test covers
 *    unknown_requirement with an assigned order.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkPlan, proposeRepairs, buildAnalysis, stableId } from '../src/lib/domain';
import { createFixture } from '../src/lib/business-setup';
import type { Workspace, WorkspaceEdit } from '../src/lib/types';

function allCoveredWorkspace(id = 'cov-01'): Workspace {
  return {
    id, revision: 1, scenario: 'S1', createdAt: '2026-10-18T08:00:00Z',
    sites: [{ id: 's1', name: 'Site One', region: 'north' }],
    assets: [{ id: 'a1', siteId: 's1', name: 'Main Asset', criticality: 'low' }],
    windows: [{ id: 'w1', label: 'Window 1', day: 1, start: '2026-10-20T08:00:00Z', end: '2026-10-20T12:00:00Z' }],
    certifications: [{ id: 'c1', name: 'Base Certification' }],
    technicians: [{
      id: 't1', name: 'Tech One', homeSiteId: 's1',
      certifications: [{ certificationId: 'c1', validUntil: '2027-01-01T00:00:00Z' }],
      maxConsecutiveShifts: 3,
    }],
    workOrders: [{
      id: 'wo-1', siteId: 's1', assetId: 'a1', title: 'Covered task', windowId: 'w1',
      requiredCertificationIds: ['c1'], partIds: [], assignedTechnicianId: 't1', etaHours: 1, status: 'scheduled',
    }],
    parts: [], unknowns: [],
  };
}

describe('FieldProof deterministic domain', () => {
  describe('checkPlan', () => {
    it('S1 hero: flags Dana\'s expired HV cert for wo-114 and wo-115 unassigned, ok=false', () => {
      const ws = createFixture('chk-s1', 'S1');
      const result = checkPlan(ws);
      assert.equal(result.ok, false);
      const certFinding = result.findings.find((f) => f.code === 'cert_not_valid' && f.evidencePath.includes('wo-114'));
      assert.ok(certFinding, 'expected cert_not_valid for wo-114');
      assert.deepEqual(certFinding.evidencePath, [
        'Meridian-7', 'HV Switchgear Panel', 'wo-114', 'cert-hv', 'tech-dana',
      ]);
      const unassigned = result.findings.find((f) => f.code === 'unassigned' && f.evidencePath.includes('wo-115'));
      assert.ok(unassigned, 'expected unassigned for wo-115');
    });

    it('S1: reassigning wo-114 to Ravi clears the cert_not_valid finding for wo-114', () => {
      const ws = createFixture('chk-s1b', 'S1');
      const changes: WorkspaceEdit[] = [{ kind: 'assign-technician', workOrderId: 'wo-114', technicianId: 'tech-ravi' }];
      const result = checkPlan(ws, changes);
      const wo114Cert = result.findings.filter((f) => f.code === 'cert_not_valid' && f.evidencePath.includes('wo-114'));
      assert.equal(wo114Cert.length, 0, 'Ravi holds valid cert-hv, so wo-114 cert finding should clear');
    });

    it('S2: work orders do not reference the shared truck in partIds, so the domain raises no critical finding', () => {
      const ws = createFixture('chk-s2', 'S2');
      const result = checkPlan(ws);
      // part-truck exists and is reserved for wo-201, but neither work order lists
      // it in partIds, so the part-conflict path is not triggered; consecutive
      // shifts (2) are within max (3), and cert-lift is valid. No critical findings.
      assert.equal(result.ok, true);
      assert.equal(result.findings.filter((f) => f.severity === 'critical').length, 0);
      assert.equal(result.findings.filter((f) => f.code === 'cert_not_valid').length, 0);
    });

    it('part_conflict: two work orders share one unit of a part in overlapping windows', () => {
      const ws: Workspace = {
        ...allCoveredWorkspace('pc'),
        workOrders: [
          { id: 'wo-a', siteId: 's1', assetId: 'a1', title: 'Task A', windowId: 'w1', requiredCertificationIds: [], partIds: ['p1'], assignedTechnicianId: 't1', etaHours: 1, status: 'scheduled' },
          { id: 'wo-b', siteId: 's1', assetId: 'a1', title: 'Task B', windowId: 'w1', requiredCertificationIds: [], partIds: ['p1'], assignedTechnicianId: 't1', etaHours: 1, status: 'scheduled' },
        ],
        parts: [{ id: 'p1', name: 'Shared part (single unit)', quantity: 1, reservedForWorkOrderId: 'wo-a' }],
      };
      const result = checkPlan(ws);
      assert.equal(result.ok, false);
      const conflict = result.findings.find((f) => f.code === 'part_conflict');
      assert.ok(conflict, 'expected part_conflict for the shared single-unit part');
      assert.deepEqual(conflict.evidencePath, ['p1', 'wo-a', 'wo-b']);
    });

    it('S3: unassigned work order + unknown legacy asset -> blocked, ok=false, no invented cert findings', () => {
      const ws = createFixture('chk-s3', 'S3');
      const result = checkPlan(ws);
      assert.equal(result.ok, false);
      assert.ok(result.findings.find((f) => f.code === 'unassigned' && f.evidencePath.includes('wo-301')));
      assert.equal(result.findings.filter((f) => f.code === 'cert_not_valid').length, 0);
      assert.equal(ws.unknowns.length, 2);
    });

    it('unknown_requirement: an assigned order on an asset with an unknown requirement surfaces a warning and is not guessed', () => {
      const ws: Workspace = {
        ...allCoveredWorkspace('uq'),
        workOrders: [{ id: 'wo-1', siteId: 's1', assetId: 'a1', title: 'Covered task', windowId: 'w1', requiredCertificationIds: ['c1'], partIds: [], assignedTechnicianId: 't1', etaHours: 1, status: 'scheduled' }],
        unknowns: [{ assetId: 'a1', note: 'Original specification missing; required certification not recorded.' }],
      };
      const result = checkPlan(ws);
      assert.equal(result.ok, true, 'a warning alone does not fail the bounded check');
      assert.ok(result.findings.find((f) => f.code === 'unknown_requirement' && f.severity === 'warning'), 'expected unknown_requirement warning');
      assert.equal(result.findings.filter((f) => f.code === 'cert_not_valid').length, 0);
    });

    it('bound: more than MAX_WORK_ORDERs -> too_many_work_orders, ok=false', () => {
      const ws = allCoveredWorkspace('bound');
      ws.workOrders = Array.from({ length: 51 }, (_, i) => ({
        id: `wo-bulk-${i}`, siteId: 's1', assetId: 'a1', title: `Bulk ${i}`, windowId: 'w1',
        requiredCertificationIds: [], partIds: [], assignedTechnicianId: null, etaHours: 1, status: 'pending',
      }));
      const result = checkPlan(ws);
      assert.equal(result.ok, false);
      assert.ok(result.findings.find((f) => f.code === 'too_many_work_orders'));
    });
  });

  describe('proposeRepairs', () => {
    it('S1: emits a valid reschedule proposal to the earliest legal window after current', () => {
      const ws = createFixture('pr-s1', 'S1');
      const proposals = proposeRepairs(ws);
      assert.ok(proposals.length > 0);
      const reschedule = proposals.find((p) => p.valid && p.changes.some((c) => c.kind === 'reschedule' && c.workOrderId === 'wo-114'));
      assert.ok(reschedule, 'expected a valid reschedule proposal for wo-114');
      const change = reschedule.changes.find((c) => c.kind === 'reschedule');
      assert.ok(change, 'reschedule change present');
      // Ravi holds a valid cert-hv at every window, so the earliest legal window
      // strictly after win-d1am is win-d1pm.
      assert.equal(change.toWindowId, 'win-d1pm');
      // Ravi holds a valid cert-hv, so he is not a rejected candidate on cert grounds.
      const raviRejected = proposals.some((p) => p.rejectedCandidates.some((r) => r.technicianId === 'tech-ravi'));
      assert.equal(raviRejected, false);
    });

    it('rejected candidate: technician missing a required cert -> valid=false with evidence', () => {
      const ws: Workspace = {
        ...allCoveredWorkspace('rej'),
        technicians: [
          { id: 't1', name: 'Tech One', homeSiteId: 's1', certifications: [{ certificationId: 'c1', validUntil: '2026-01-01T00:00:00Z' }], maxConsecutiveShifts: 3 }, // expired
          { id: 't2', name: 'Tech Two', homeSiteId: 's1', certifications: [], maxConsecutiveShifts: 3 }, // lacks c1 entirely
        ],
      };
      const proposals = proposeRepairs(ws);
      const rejected = proposals.find((p) => !p.valid);
      assert.ok(rejected, 'expected a rejected-candidate proposal');
      assert.equal(rejected.valid, false);
      assert.ok(rejected.invalidReason, 'invalidReason should carry rejection evidence');
      assert.ok(rejected.rejectedCandidates.some((r) => r.technicianId === 't2'), 't2 should be rejected with reason');
    });

    it('returns [] when the plan is already covered', () => {
      const ws = allCoveredWorkspace();
      assert.equal(proposeRepairs(ws).length, 0);
    });
  });

  describe('buildAnalysis', () => {
    it('assembles check + proposals deterministically', () => {
      const ws = createFixture('ba-s1', 'S1');
      const analysis = buildAnalysis(ws);
      assert.equal(analysis.workspaceRevision, ws.revision);
      assert.equal(analysis.check.ok, false);
      assert.ok(Array.isArray(analysis.proposals));
      assert.deepEqual(buildAnalysis(ws), analysis);
    });
  });

  describe('stableId', () => {
    it('is deterministic and input-sensitive', () => {
      assert.equal(stableId('clarify', 'asset-legacy-1'), stableId('clarify', 'asset-legacy-1'));
      assert.notEqual(stableId('clarify', 'asset-legacy-1'), stableId('clarify', 'asset-legacy-2'));
      assert.notEqual(stableId('reschedule', 'wo-114'), stableId('reject', 'wo-114'));
    });
  });
});
