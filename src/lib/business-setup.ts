/**
 * FieldProof — synthetic fixtures for the three scenarios described in
 * .commander/context/02_WAVE_1_FLAGSHIPS.md (fieldproof flagship).
 *
 * All data is fictional. Each scenario isolates one hero conflict:
 *  - S1: HV cert expiry under the assigned window; backup candidate rejected
 *    with evidence; approval fact unlocks the original deadline.
 *  - S2: two rural sites share one insulated-lift truck — double-booked
 *    windows, repair = resequence by drive-time.
 *  - S3: incomplete records — asset cert requirements UNKNOWN; truthful
 *    "unknown" surface, block until clarified (never guessed).
 */
import type { ScenarioId, Workspace } from './types';

const now = () => new Date('2026-10-18T08:00:00Z').toISOString();

function baseWorkspace(id: string, scenario: ScenarioId): Workspace {
  return {
    id,
    revision: 1,
    scenario,
    createdAt: now(),
    sites: [],
    assets: [],
    windows: [],
    certifications: [],
    technicians: [],
    workOrders: [],
    parts: [],
    unknowns: [],
  };
}

/** S1 — hero: W-114 HV switchgear at Meridian-7, Dana's HV cert expires before D1-AM. */
export function scenarioS1(id: string): Workspace {
  const ws = baseWorkspace(id, 'S1');
  ws.sites = [
    { id: 'site-m7', name: 'Meridian-7', region: 'north' },
    { id: 'site-rural-a', name: 'Riverside Rural', region: 'rural' },
  ];
  ws.assets = [
    { id: 'asset-swgr', siteId: 'site-m7', name: 'HV Switchgear Panel', criticality: 'high' },
    { id: 'asset-xfmr', siteId: 'site-m7', name: 'Distribution Transformer', criticality: 'high' },
    { id: 'asset-pole', siteId: 'site-rural-a', name: 'Rural Distribution Pole', criticality: 'medium' },
  ];
  // D1-AM, D1-PM, D2-AM
  ws.windows = [
    { id: 'win-d1am', label: 'Day 1 AM', day: 1, start: '2026-10-19T08:00:00Z', end: '2026-10-19T12:00:00Z' },
    { id: 'win-d1pm', label: 'Day 1 PM', day: 1, start: '2026-10-19T13:00:00Z', end: '2026-10-19T17:00:00Z' },
    { id: 'win-d2am', label: 'Day 2 AM', day: 2, start: '2026-10-20T08:00:00Z', end: '2026-10-20T12:00:00Z' },
  ];
  ws.certifications = [
    { id: 'cert-hv', name: 'HV Switchgear Certification' },
    { id: 'cert-arc', name: 'Arc-Flash Safety Certification' },
  ];
  ws.technicians = [
    {
      id: 'tech-dana',
      name: 'Dana',
      homeSiteId: 'site-m7',
      certifications: [{ certificationId: 'cert-hv', validUntil: '2026-10-18T00:00:00Z' }],
      maxConsecutiveShifts: 3,
    },
    {
      id: 'tech-ravi',
      name: 'Ravi',
      homeSiteId: 'site-m7',
      certifications: [
        { certificationId: 'cert-hv', validUntil: '2026-12-31T00:00:00Z' },
        { certificationId: 'cert-arc', validUntil: '2026-12-31T00:00:00Z' },
      ],
      maxConsecutiveShifts: 3,
    },
  ];
  // W-114 assigned to Dana, window D1-AM, needs HV cert + arc-flash kit P-88.
  ws.workOrders = [
    {
      id: 'wo-114', siteId: 'site-m7', assetId: 'asset-swgr',
      title: 'HV switchgear replacement', windowId: 'win-d1am',
      requiredCertificationIds: ['cert-hv'],
      partIds: ['part-p88'],
      assignedTechnicianId: 'tech-dana',
      etaHours: 4,
      status: 'blocked',
    },
    {
      id: 'wo-115', siteId: 'site-m7', assetId: 'asset-xfmr',
      title: 'Transformer inspection', windowId: 'win-d1pm',
      requiredCertificationIds: ['cert-hv'],
      partIds: [],
      assignedTechnicianId: null,
      etaHours: 2,
      status: 'pending',
    },
  ];
  ws.parts = [
    { id: 'part-p88', name: 'Arc-flash kit (single unit)', quantity: 1, reservedForWorkOrderId: 'wo-114' },
  ];
  ws.unknowns = [];
  return ws;
}

/** S2 — two rural sites share one insulated-lift truck; double-booked windows. */
export function scenarioS2(id: string): Workspace {
  const ws = baseWorkspace(id, 'S2');
  ws.sites = [
    { id: 'site-rural-a', name: 'Riverside Rural', region: 'rural' },
    { id: 'site-rural-b', name: 'Hollow Creek Rural', region: 'rural' },
  ];
  ws.assets = [
    { id: 'asset-pole-a', siteId: 'site-rural-a', name: 'Rural Pole A', criticality: 'medium' },
    { id: 'asset-pole-b', siteId: 'site-rural-b', name: 'Rural Pole B', criticality: 'medium' },
  ];
  // Two sites, same window D1-AM — one truck cannot serve both.
  ws.windows = [
    { id: 'win-d1am', label: 'Day 1 AM', day: 1, start: '2026-10-19T08:00:00Z', end: '2026-10-19T12:00:00Z' },
    { id: 'win-d2am', label: 'Day 2 AM', day: 2, start: '2026-10-20T08:00:00Z', end: '2026-10-20T12:00:00Z' },
  ];
  ws.certifications = [
    { id: 'cert-lift', name: 'Insulated Lift Operation' },
  ];
  ws.technicians = [
    {
      id: 'tech-marina',
      name: 'Marina',
      homeSiteId: 'site-rural-a',
      certifications: [{ certificationId: 'cert-lift', validUntil: '2027-01-01T00:00:00Z' }],
      maxConsecutiveShifts: 3,
    },
  ];
  ws.workOrders = [
    {
      id: 'wo-201', siteId: 'site-rural-a', assetId: 'asset-pole-a',
      title: 'Pole A line repair', windowId: 'win-d1am',
      requiredCertificationIds: ['cert-lift'],
      partIds: [],
      assignedTechnicianId: 'tech-marina',
      etaHours: 3,
      status: 'scheduled',
    },
    {
      id: 'wo-202', siteId: 'site-rural-b', assetId: 'asset-pole-b',
      title: 'Pole B line repair', windowId: 'win-d1am',
      requiredCertificationIds: ['cert-lift'],
      partIds: [],
      assignedTechnicianId: 'tech-marina',
      etaHours: 3,
      status: 'scheduled',
    },
  ];
  ws.parts = [
    { id: 'part-truck', name: 'Insulated lift truck (single unit)', quantity: 1, reservedForWorkOrderId: 'wo-201' },
  ];
  ws.unknowns = [];
  return ws;
}

/** S3 — incomplete records: asset cert requirements UNKNOWN; block, never guess. */
export function scenarioS3(id: string): Workspace {
  const ws = baseWorkspace(id, 'S3');
  ws.sites = [
    { id: 'site-legacy', name: 'Legacy Substation', region: 'north' },
  ];
  ws.assets = [
    { id: 'asset-legacy-1', siteId: 'site-legacy', name: 'Legacy Breaker Bank', criticality: 'high' },
    { id: 'asset-legacy-2', siteId: 'site-legacy', name: 'Legacy Relay Panel', criticality: 'high' },
  ];
  ws.windows = [
    { id: 'win-d1am', label: 'Day 1 AM', day: 1, start: '2026-10-19T08:00:00Z', end: '2026-10-19T12:00:00Z' },
  ];
  ws.certifications = [];
  ws.technicians = [
    {
      id: 'tech-jorge',
      name: 'Jorge',
      homeSiteId: 'site-legacy',
      certifications: [],
      maxConsecutiveShifts: 3,
    },
  ];
  ws.workOrders = [
    {
      id: 'wo-301', siteId: 'site-legacy', assetId: 'asset-legacy-1',
      title: 'Legacy breaker inspection', windowId: 'win-d1am',
      requiredCertificationIds: [],
      partIds: [],
      assignedTechnicianId: null,
      etaHours: 2,
      status: 'blocked',
    },
  ];
  ws.parts = [];
  // The certification requirement for the legacy asset is genuinely unknown.
  ws.unknowns = [
    { assetId: 'asset-legacy-1', note: 'Original specification missing; required certification not recorded in the asset registry.' },
    { assetId: 'asset-legacy-2', note: 'Legacy relay panel; certification requirement never documented.' },
  ];
  return ws;
}

export function createFixture(id: string, scenario: ScenarioId = 'S1'): Workspace {
  switch (scenario) {
    case 'S1': return scenarioS1(id);
    case 'S2': return scenarioS2(id);
    case 'S3': return scenarioS3(id);
  }
}
