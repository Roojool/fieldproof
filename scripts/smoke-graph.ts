// Dev utility: smoke-test the FieldProof graph layer against the configured FalkorDB.
// Usage: npx tsx scripts/smoke-graph.ts   (reads FALKORDB_URL from .env.local via --env-file)
import { createWorkspace, readWorkspace, graphHealth, closeGraphConnection } from '../src/lib/graph';
import type { Workspace } from '../src/lib/types';

function fixture(id: string): Workspace {
  return {
    id,
    revision: 1,
    scenario: 'S1',
    createdAt: new Date('2026-10-18T08:00:00Z').toISOString(),
    sites: [{ id: 'site-m7', name: 'Meridian-7', region: 'north' }],
    assets: [{ id: 'asset-swgr', siteId: 'site-m7', name: 'HV Switchgear', criticality: 'high' }],
    windows: [
      { id: 'win-d1am', label: 'Day 1 AM', day: 1, start: '2026-10-19T08:00:00Z', end: '2026-10-19T12:00:00Z' },
      { id: 'win-d2am', label: 'Day 2 AM', day: 2, start: '2026-10-20T08:00:00Z', end: '2026-10-20T12:00:00Z' },
    ],
    certifications: [{ id: 'cert-hv', name: 'HV Switchgear Certification' }],
    technicians: [
      {
        id: 'tech-dana',
        name: 'Dana',
        homeSiteId: 'site-m7',
        certifications: [{ certificationId: 'cert-hv', validUntil: '2026-10-18T00:00:00Z' }],
        maxConsecutiveShifts: 3,
      },
      { id: 'tech-ravi', name: 'Ravi', homeSiteId: 'site-m7', certifications: [], maxConsecutiveShifts: 3 },
    ],
    workOrders: [
      {
        id: 'wo-114',
        siteId: 'site-m7',
        assetId: 'asset-swgr',
        title: 'HV switchgear replacement',
        windowId: 'win-d1am',
        requiredCertificationIds: ['cert-hv'],
        partIds: ['part-p88'],
        assignedTechnicianId: 'tech-dana',
        etaHours: 4,
        status: 'blocked',
      },
    ],
    parts: [{ id: 'part-p88', name: 'Arc-flash kit', quantity: 1, reservedForWorkOrderId: 'wo-114' }],
    unknowns: [{ assetId: 'asset-swgr', note: 'smoke-test placeholder none' }],
  };
}

async function main(): Promise<void> {
  const healthy = await graphHealth();
  if (!healthy) {
    console.error('SMOKE FAIL: graph health check returned false');
    process.exit(1);
  }
  console.log('health: OK');
  const ws = await createWorkspace('smoke01', fixture('smoke01'));
  console.log(`created: revision=${ws.revision} sites=${ws.sites.length} orders=${ws.workOrders.length}`);
  const back = await readWorkspace('smoke01');
  if (!back) {
    console.error('SMOKE FAIL: readWorkspace returned null');
    process.exit(1);
  }
  const order = back.workOrders.find((o) => o.id === 'wo-114');
  const dana = back.technicians.find((t) => t.id === 'tech-dana');
  const ok =
    back.sites.length === 1 &&
    back.assets.length === 1 &&
    back.windows.length === 2 &&
    back.certifications.length === 1 &&
    back.technicians.length === 2 &&
    back.parts.length === 1 &&
    back.unknowns.length === 1 &&
    order !== undefined &&
    order.requiredCertificationIds.length === 1 &&
    order.partIds.length === 1 &&
    order.assignedTechnicianId === 'tech-dana' &&
    dana !== undefined &&
    dana.certifications.length === 1 &&
    dana.certifications[0].validUntil === '2026-10-18T00:00:00Z';
  console.log(ok ? 'SMOKE PASS: snapshot rebuild matches fixture through traversals' : 'SMOKE FAIL: snapshot mismatch');
  if (!ok) {
    console.log(JSON.stringify(back, null, 2));
  }
  await closeGraphConnection();
  process.exit(ok ? 0 : 1);
}

void main();
