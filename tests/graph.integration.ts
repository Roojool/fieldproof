/**
 * FieldProof — FalkorDB integration tests (phase 05).
 *
 * Runs against the shared FalkorDB at redis://127.0.0.1:16380 (FALKORDB_URL
 * from .env.local). Every test uses a unique workspace id so tests never
 * collide; createWorkspace deletes its graph first, so re-runs are safe.
 *
 * Requires `npm run test:integration` (tsx --env-file-if-exists=.env.local).
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createWorkspace, readWorkspace, editWorkspace, approveProposal, analyzeWorkspace,
  recallMemory, graphHealth, closeGraphConnection, FieldProofError,
} from '../src/lib/graph';
import { createFixture } from '../src/lib/business-setup';
import type { Workspace } from '../src/lib/types';

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function freshS1(id: string): Workspace {
  return createFixture(id, 'S1');
}

describe('FieldProof FalkorDB integration', () => {
  describe('graphHealth', () => {
    it('reports the shared FalkorDB reachable', async () => {
      assert.equal(await graphHealth(), true);
    });
  });

  describe('createWorkspace / readWorkspace', () => {
    it('S1 snapshot rebuild matches the fixture through real traversals', async () => {
      const id = uniqueId('ws-s1');
      const ws = await createWorkspace(id, freshS1(id));
      assert.equal(ws.revision, 1);
      assert.equal(ws.sites.length, 2);
      assert.equal(ws.assets.length, 3);
      assert.equal(ws.windows.length, 3);
      assert.equal(ws.certifications.length, 2);
      assert.equal(ws.technicians.length, 2);
      assert.equal(ws.workOrders.length, 2);
      assert.equal(ws.parts.length, 1);
      assert.equal(ws.unknowns.length, 0);

      const order = ws.workOrders.find((o) => o.id === 'wo-114');
      assert.ok(order, 'wo-114 present');
      assert.equal(order.windowId, 'win-d1am');
      assert.equal(order.assignedTechnicianId, 'tech-dana');
      assert.deepEqual(order.requiredCertificationIds, ['cert-hv']);
      assert.deepEqual(order.partIds, ['part-p88']);

      const dana = ws.technicians.find((t) => t.id === 'tech-dana');
      assert.ok(dana);
      const holds = dana.certifications.find((h) => h.certificationId === 'cert-hv');
      assert.ok(holds);
      assert.equal(holds.validUntil, '2026-10-18T00:00:00Z');

      const ravi = ws.technicians.find((t) => t.id === 'tech-ravi');
      assert.ok(ravi);
      const raviHolds = ravi.certifications.map((h) => h.certificationId).sort();
      assert.deepEqual(raviHolds, ['cert-arc', 'cert-hv']);

      const part = ws.parts.find((p) => p.id === 'part-p88');
      assert.ok(part);
      assert.equal(part.quantity, 1);
      assert.equal(part.reservedForWorkOrderId, 'wo-114');

      // readWorkspace re-reads through traversals and must agree.
      const again = await readWorkspace(id);
      assert.ok(again);
      assert.equal(again.workOrders.find((o) => o.id === 'wo-114')?.assignedTechnicianId, 'tech-dana');
    });

    it('readWorkspace returns null for an unknown workspace', async () => {
      const missing = await readWorkspace(uniqueId('nope'));
      assert.equal(missing, null);
    });
  });

  describe('editWorkspace (guarded mutations)', () => {
    it('reschedule bumps revision and moves the work order window', async () => {
      const id = uniqueId('ws-resched');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      const updated = await editWorkspace(id, before.revision, {
        kind: 'reschedule', workOrderId: 'wo-114', windowId: 'win-d2am',
      });
      assert.equal(updated.revision, before.revision + 1);
      assert.equal(updated.workOrders.find((o) => o.id === 'wo-114')?.windowId, 'win-d2am');
    });

    it('assign-technician updates the assignment edge', async () => {
      const id = uniqueId('ws-assign');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      const updated = await editWorkspace(id, before.revision, {
        kind: 'assign-technician', workOrderId: 'wo-115', technicianId: 'tech-ravi',
      });
      assert.equal(updated.revision, before.revision + 1);
      assert.equal(updated.workOrders.find((o) => o.id === 'wo-115')?.assignedTechnicianId, 'tech-ravi');
    });

    it('reserve-part moves the single-unit part reservation', async () => {
      const id = uniqueId('ws-reserve');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      const updated = await editWorkspace(id, before.revision, {
        kind: 'reserve-part', partId: 'part-p88', workOrderId: 'wo-115',
      });
      assert.equal(updated.revision, before.revision + 1);
      const part = updated.parts.find((p) => p.id === 'part-p88');
      assert.ok(part);
      assert.equal(part.reservedForWorkOrderId, 'wo-115');
      assert.ok(updated.workOrders.find((o) => o.id === 'wo-115')?.partIds.includes('part-p88'));
    });

    it('clarify-unknown removes the Unknown and records a cert requirement (S3)', async () => {
      const id = uniqueId('ws-clarify');
      const ws = createFixture(id, 'S3');
      await createWorkspace(id, ws);
      const before = await readWorkspace(id);
      assert.ok(before);
      assert.ok(before.unknowns.find((u) => u.assetId === 'asset-legacy-1'));
      const updated = await editWorkspace(id, before.revision, {
        kind: 'clarify-unknown', assetId: 'asset-legacy-1',
        certificationIds: ['cert-hv'], note: 'Clarified per legacy register lookup.',
      });
      assert.equal(updated.revision, before.revision + 1);
      assert.equal(updated.unknowns.find((u) => u.assetId === 'asset-legacy-1'), undefined);
      const order = updated.workOrders.find((o) => o.id === 'wo-301');
      assert.ok(order);
      assert.ok(order.requiredCertificationIds.includes('cert-hv'));
      // The other legacy asset stays unknown — we never guess.
      assert.ok(updated.unknowns.find((u) => u.assetId === 'asset-legacy-2'));
    });

    it('stale revision -> 409 stale_revision', async () => {
      const id = uniqueId('ws-stale');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      let threw = false;
      try {
        await editWorkspace(id, 9999, {
          kind: 'reschedule', workOrderId: 'wo-114', windowId: 'win-d2am',
        });
      } catch (e) {
        threw = true;
        const err = e as FieldProofError;
        assert.equal(err.code, 'stale_revision');
        assert.equal(err.status, 409);
      }
      assert.equal(threw, true, 'expected a stale_revision error');
    });
  });

  describe('approveProposal (idempotent repair approval)', () => {
    it('replaying with the same idempotency key returns the same decision and bumps revision once', async () => {
      const id = uniqueId('ws-approve');
      await createWorkspace(id, freshS1(id));
      const { workspace: ws1, analysis } = await analyzeWorkspace(id, 1);
      const proposal = analysis.proposals.find((p) => p.valid);
      assert.ok(proposal, 'expected at least one valid proposal');

      const key = `idem-${uniqueId('key')}`;
      const proposalJson = JSON.stringify({ proposalId: proposal.id });
      const d1 = await approveProposal(id, ws1.revision, proposal.id, key, proposalJson);
      const d2 = await approveProposal(id, ws1.revision, proposal.id, key, proposalJson);

      assert.equal(d2.decision.id, d1.decision.id, 'idempotent replay returns same decision id');
      assert.equal(d2.decision.proposalId, proposal.id);
      assert.equal(d2.decision.workspaceRevisionAfter, d1.decision.workspaceRevisionAfter, 'revision bumped exactly once');
      assert.equal(d2.decision.idempotencyKey, key);
    });
  });

  describe('analyzeWorkspace', () => {
    it('bumps revision and returns check + proposals', async () => {
      const id = uniqueId('ws-analyze');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      const { workspace, analysis } = await analyzeWorkspace(id, before.revision);
      assert.equal(workspace.revision, before.revision + 1);
      assert.equal(analysis.check.ok, false);
      assert.ok(Array.isArray(analysis.proposals));
    });
  });

  describe('recallMemory', () => {
    it('returns a deterministic reply mentioning the referenced work order', async () => {
      const id = uniqueId('ws-memory');
      await createWorkspace(id, freshS1(id));
      const { reply } = await recallMemory(id, 'Tell me about wo-114');
      assert.equal(reply.mode, 'deterministic');
      assert.ok(reply.text.includes('wo-114'), 'reply should reference the work order');
      assert.ok(reply.text.includes('Dana'), 'reply should reference the assigned technician');
    });
  });

  describe('503 graph_unavailable', () => {
    it('operations fail with graph_unavailable when FalkorDB is unreachable', async () => {
      const origUrl = process.env.FALKORDB_URL;
      await closeGraphConnection();
      process.env.FALKORDB_URL = 'redis://127.0.0.1:1'; // certainly dead port
      try {
        assert.equal(await graphHealth(), false);
        let threw = false;
        try {
          await createWorkspace(uniqueId('dead'), freshS1(uniqueId('dead')));
        } catch (e) {
          threw = true;
          const err = e as FieldProofError;
          assert.equal(err.code, 'graph_unavailable');
          assert.equal(err.status, 503);
        }
        assert.equal(threw, true, 'expected graph_unavailable on createWorkspace');
      } finally {
        process.env.FALKORDB_URL = origUrl;
        await closeGraphConnection();
      }
    });
  });
});
