/**
 * FieldProof — FalkorDB graph storage (PACT-parity).
 *
 * Every workspace is one graph ("fieldproof-ws-<opaque server id>"). Domain entities
 * are nodes; structure lives in relationships (Site-[:HAS_ASSET]->Asset,
 * Asset-[:REQUIRES_TASK]->WorkOrder, WorkOrder-[:REQUIRES_CERT]->Certification,
 * Technician-[:HOLDS {validUntil}]->Certification ...). Snapshots are rebuilt
 * EXCLUSIVELY through traversals — no denormalized foreign keys are trusted.
 *
 * Concurrency: every mutation is a single guarded query
 *   MATCH (w:Workspace {key:$wk})
 *   WHERE w.revision = $rev AND w.createdAt = $createdAt
 *   SET w.revision = w.revision + 1
 * FalkorDB executes one query atomically, so exactly one competing writer wins;
 * losers observe an empty result set and surface 409 stale_revision. The createdAt
 * term defeats revision-counter reuse after a reset.
 *
 * There is NO in-memory business-state fallback: if the database is unreachable,
 * operations fail with 503 graph_unavailable.
 */
import { FalkorDB, type Graph } from 'falkordb';
import { randomUUID } from 'node:crypto';
import type { AgentMode, AgentReply, Analysis, Decision, Workspace, WorkspaceEdit } from './types';
import { buildAnalysis } from './domain';

export class FieldProofError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'FieldProofError';
  }
}

function dbUrl(): string {
  const url = process.env.FALKORDB_URL?.trim();
  return url && url.length > 0 ? url : 'redis://127.0.0.1:16380';
}

let clientPromise: Promise<FalkorDB> | null = null;

/** Close the shared connection during process/test teardown. */
export async function closeGraphConnection(): Promise<void> {
  const pending = clientPromise;
  clientPromise = null;
  if (pending) await (await pending).close();
}

function unavailable(err: unknown): FieldProofError {
  const message = err instanceof Error ? err.message : String(err);
  return new FieldProofError(`Graph storage unavailable: ${message}`, 'graph_unavailable', 503);
}

/** FalkorDB reports "Invalid graph operation on empty key" for a graph that
 *  does not exist yet. Read-only calls treat that as "no such workspace". */
function isGraphMissingError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /empty key/i.test(message) || /graph.*not found/i.test(message);
}

async function getClient(): Promise<FalkorDB> {
  if (!clientPromise) {
    clientPromise = FalkorDB.connect({ url: dbUrl() }).then((client) => {
      client.on('error', () => undefined);
      return client;
    });
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

function validateWorkspaceId(id: string): string {
  const trimmed = id.trim();
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(trimmed)) {
    throw new FieldProofError('Invalid workspace id', 'invalid_workspace_id', 400);
  }
  return trimmed;
}

function graphKey(workspaceId: string): string {
  return `fieldproof-ws-${validateWorkspaceId(workspaceId)}`;
}

async function graphFor(workspaceId: string): Promise<{ g: Graph; wk: string }> {
  try {
    const client = await getClient();
    return { g: client.selectGraph(graphKey(workspaceId)), wk: graphKey(workspaceId) };
  } catch (err) {
    if (err instanceof FieldProofError) throw err;
    throw unavailable(err);
  }
}

async function run(
  g: Graph,
  query: string,
  params: Record<string, unknown>,
  readonly = false,
): Promise<Record<string, unknown>[]> {
  try {
    const options = { params: params as never };
    const reply = readonly
      ? await g.roQuery<Record<string, unknown>>(query, options)
      : await g.query<Record<string, unknown>>(query, options);
    return reply.data ?? [];
  } catch (err) {
    if (err instanceof FieldProofError) throw err;
    if (readonly && isGraphMissingError(err)) return [];
    throw unavailable(err);
  }
}

/* --------------------------------- coercers --------------------------------- */

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function nullOrStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/* ------------------------------- graph creation ------------------------------ */

export async function createWorkspace(workspaceId: string, fixture: Workspace): Promise<Workspace> {
  const { g, wk } = await graphFor(workspaceId);
  try {
    await g.delete();
  } catch {
    // graph may not exist yet
  }

  const createdAt = fixture.createdAt;
  await run(
    g,
    `CREATE (w:Workspace {key:$wk, workspaceId:$wid, revision:1, createdAt:$createdAt, scenario:$scenario})`,
    { wk, wid: workspaceId, createdAt, scenario: fixture.scenario },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     CREATE (w)-[:HAS_SITE]->(:Site {id: row.id, name: row.name, region: row.region})`,
    { wk, rows: fixture.sites.map((s) => ({ id: s.id, name: s.name, region: s.region })) },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (w)-[:HAS_SITE]->(s:Site {id: row.siteId})
     CREATE (s)-[:HAS_ASSET]->(:Asset {id: row.id, name: row.name, criticality: row.criticality})`,
    { wk, rows: fixture.assets.map((a) => ({ id: a.id, siteId: a.siteId, name: a.name, criticality: a.criticality })) },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (w)-[:HAS_SITE]->()-[:HAS_ASSET]->(a:Asset {id: row.assetId})
     CREATE (a)-[:REQUIRES_TASK]->(:WorkOrder {
       id: row.id, title: row.title, windowId: row.windowId, etaHours: row.etaHours,
       status: row.status, assignedTechnicianId: row.assignedTechnicianId
     })`,
    {
      wk,
      rows: fixture.workOrders.map((o) => ({
        id: o.id,
        assetId: o.assetId,
        title: o.title,
        windowId: o.windowId,
        etaHours: o.etaHours,
        status: o.status,
        assignedTechnicianId: o.assignedTechnicianId,
      })),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MERGE (w)-[:HAS_WINDOW]->(win:ShiftWindow {id: row.id})
     ON CREATE SET win.label = row.label, win.day = row.day, win.start = row.start, win.end = row.end`,
    {
      wk,
      rows: fixture.windows.map((win) => ({
        id: win.id,
        label: win.label,
        day: win.day,
        start: win.start,
        end: win.end,
      })),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (w)-[:HAS_SITE]->()-[:HAS_ASSET]->()-[:REQUIRES_TASK]->(o:WorkOrder {id: row.orderId})
     MATCH (win:ShiftWindow {id: row.id})
     MERGE (o)-[:IN_WINDOW]->(win)`,
    {
      wk,
      rows: fixture.workOrders.flatMap((o) =>
        fixture.windows.some((x) => x.id === o.windowId) ? [{ orderId: o.id, id: o.windowId }] : [],
      ),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MERGE (c:Certification {id: row.id})
     ON CREATE SET c.name = row.name`,
    { wk, rows: fixture.certifications.map((c) => ({ id: c.id, name: c.name })) },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (w)-[:HAS_SITE]->()-[:HAS_ASSET]->()-[:REQUIRES_TASK]->(o:WorkOrder {id: row.orderId})
     MERGE (c:Certification {id: row.certId})
     ON CREATE SET c.name = row.certName
     MERGE (o)-[:REQUIRES_CERT]->(c)`,
    {
      wk,
      rows: fixture.workOrders.flatMap((o) =>
        o.requiredCertificationIds.map((cid) => ({
          orderId: o.id,
          certId: cid,
          certName: fixture.certifications.find((c) => c.id === cid)?.name ?? cid,
        })),
      ),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     CREATE (w)-[:HAS_TECH]->(:Technician {
       id: row.id, name: row.name, homeSiteId: row.homeSiteId, maxConsecutiveShifts: row.maxConsecutiveShifts
     })`,
    {
      wk,
      rows: fixture.technicians.map((t) => ({
        id: t.id,
        name: t.name,
        homeSiteId: t.homeSiteId,
        maxConsecutiveShifts: t.maxConsecutiveShifts,
      })),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (w)-[:HAS_TECH]->(t:Technician {id: row.technicianId}), (c:Certification {id: row.certificationId})
     MERGE (t)-[h:HOLDS]->(c)
     ON CREATE SET h.validUntil = row.validUntil
     ON MATCH SET h.validUntil = row.validUntil`,
    {
      wk,
      rows: fixture.technicians.flatMap((t) =>
        t.certifications.map((h) => ({
          technicianId: t.id,
          certificationId: h.certificationId,
          validUntil: h.validUntil,
        })),
      ),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (t:Technician {id: row.technicianId}), (o:WorkOrder {id: row.orderId})
     MERGE (t)-[:ASSIGNED_TO]->(o)`,
    {
      wk,
      rows: fixture.workOrders
        .filter((o) => o.assignedTechnicianId !== null)
        .map((o) => ({ technicianId: o.assignedTechnicianId as string, orderId: o.id })),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MERGE (w)-[:HAS_PART]->(p:Part {id: row.id})
     ON CREATE SET p.name = row.name, p.quantity = row.quantity, p.reservedForWorkOrderId = row.reservedForWorkOrderId`,
    {
      wk,
      rows: fixture.parts.map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        reservedForWorkOrderId: p.reservedForWorkOrderId,
      })),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (p:Part {id: row.partId}), (o:WorkOrder {id: row.orderId})
     MERGE (o)-[:NEEDS_PART]->(p)`,
    {
      wk,
      rows: fixture.workOrders.flatMap((o) =>
        o.partIds.map((pid) => ({ orderId: o.id, partId: pid })),
      ),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     CREATE (w)-[:HAS_UNKNOWN]->(:Unknown {assetId: row.assetId, note: row.note})`,
    { wk, rows: fixture.unknowns.map((u) => ({ assetId: u.assetId, note: u.note })) },
  );

  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new FieldProofError('Workspace snapshot failed to rebuild after creation', 'snapshot_failed', 500);
  }
  return rebuilt;
}

/* ------------------------------ snapshot rebuild ----------------------------- */
/* Every query projects scalar properties (RETURN n.prop AS prop) — the client does
   not deserialize whole nodes, mirroring the PACT reader contract. */

export async function readWorkspace(workspaceId: string): Promise<Workspace | null> {
  const { g, wk } = await graphFor(workspaceId);

  const metaRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     RETURN w.workspaceId AS workspaceId, w.revision AS revision, w.createdAt AS createdAt, w.scenario AS scenario`,
    { wk },
    true,
  );
  if (metaRows.length === 0) return null;
  const meta = metaRows[0];

  const sites = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_SITE]->(s:Site)
     RETURN s.id AS id, s.name AS name, s.region AS region ORDER BY id`,
    { wk },
    true,
  )).map((r) => ({ id: str(r['id']), name: str(r['name']), region: str(r['region']) }));

  const assets = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_SITE]->(s:Site)-[:HAS_ASSET]->(a:Asset)
     RETURN s.id AS siteId, a.id AS id, a.name AS name, a.criticality AS criticality ORDER BY id`,
    { wk },
    true,
  )).map((r) => {
    const crit = str(r['criticality']);
    return {
      id: str(r['id']),
      siteId: str(r['siteId']),
      name: str(r['name']),
      criticality: (crit === 'high' || crit === 'low' ? crit : 'medium') as 'high' | 'medium' | 'low',
    };
  });

  const workOrders = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_SITE]->(s:Site)-[:HAS_ASSET]->(a:Asset)-[:REQUIRES_TASK]->(o:WorkOrder)
     RETURN s.id AS siteId, a.id AS assetId, o.id AS id, o.title AS title, o.windowId AS windowId,
            o.etaHours AS etaHours, o.status AS status, o.assignedTechnicianId AS assignedTechnicianId
     ORDER BY id`,
    { wk },
    true,
  )).map((r) => {
    const status = str(r['status']);
    return {
      id: str(r['id']),
      siteId: str(r['siteId']),
      assetId: str(r['assetId']),
      title: str(r['title']),
      windowId: str(r['windowId']),
      requiredCertificationIds: [] as string[],
      partIds: [] as string[],
      assignedTechnicianId: nullOrStr(r['assignedTechnicianId']),
      etaHours: num(r['etaHours']),
      status: (status === 'pending' || status === 'blocked' || status === 'completed' ? status : 'scheduled') as
        | 'pending'
        | 'scheduled'
        | 'blocked'
        | 'completed',
    };
  });

  const windows = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_WINDOW]->(win:ShiftWindow)
     RETURN win.id AS id, win.label AS label, win.day AS day, win.start AS start, win.end AS end ORDER BY id`,
    { wk },
    true,
  )).map((r) => ({
    id: str(r['id']),
    label: str(r['label']),
    day: num(r['day']),
    start: str(r['start']),
    end: str(r['end']),
  }));

  const certifications = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[*1..8]->(c:Certification)
     RETURN DISTINCT c.id AS id, c.name AS name ORDER BY id`,
    { wk },
    true,
  )).map((r) => ({ id: str(r['id']), name: str(r['name']) }));

  const technicians = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_TECH]->(t:Technician)
     RETURN t.id AS id, t.name AS name, t.homeSiteId AS homeSiteId, t.maxConsecutiveShifts AS maxConsecutiveShifts ORDER BY id`,
    { wk },
    true,
  )).map((r) => ({
    id: str(r['id']),
    name: str(r['name']),
    homeSiteId: str(r['homeSiteId']),
    certifications: [] as { certificationId: string; validUntil: string }[],
    maxConsecutiveShifts: num(r['maxConsecutiveShifts'], 3),
  }));

  const holdRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_TECH]->(t:Technician)-[h:HOLDS]->(c:Certification)
     RETURN t.id AS technicianId, c.id AS certificationId, h.validUntil AS validUntil`,
    { wk },
    true,
  );
  for (const row of holdRows) {
    const tech = technicians.find((t) => t.id === str(row['technicianId']));
    if (tech) tech.certifications.push({ certificationId: str(row['certificationId']), validUntil: str(row['validUntil']) });
  }

  const assignRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_TECH]->(t:Technician)-[:ASSIGNED_TO]->(o:WorkOrder)
     RETURN t.id AS technicianId, o.id AS workOrderId`,
    { wk },
    true,
  );
  for (const row of assignRows) {
    const order = workOrders.find((o) => o.id === str(row['workOrderId']));
    if (order) order.assignedTechnicianId = str(row['technicianId']);
  }

  const certRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_SITE]->()-[:HAS_ASSET]->()-[:REQUIRES_TASK]->(o:WorkOrder)-[:REQUIRES_CERT]->(c)
     RETURN o.id AS workOrderId, c.id AS certificationId`,
    { wk },
    true,
  );
  for (const row of certRows) {
    const order = workOrders.find((o) => o.id === str(row['workOrderId']));
    if (order) order.requiredCertificationIds.push(str(row['certificationId']));
  }

  const parts = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_PART]->(p:Part)
     RETURN p.id AS id, p.name AS name, p.quantity AS quantity, p.reservedForWorkOrderId AS reservedForWorkOrderId ORDER BY id`,
    { wk },
    true,
  )).map((r) => ({
    id: str(r['id']),
    name: str(r['name']),
    quantity: num(r['quantity'], 1),
    reservedForWorkOrderId: nullOrStr(r['reservedForWorkOrderId']),
  }));

  const partRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_SITE]->()-[:HAS_ASSET]->()-[:REQUIRES_TASK]->(o:WorkOrder)-[:NEEDS_PART]->(p)
     RETURN o.id AS workOrderId, p.id AS partId`,
    { wk },
    true,
  );
  for (const row of partRows) {
    const order = workOrders.find((o) => o.id === str(row['workOrderId']));
    if (order) order.partIds.push(str(row['partId']));
  }

  const unknowns = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_UNKNOWN]->(u:Unknown)
     RETURN u.assetId AS assetId, u.note AS note ORDER BY assetId`,
    { wk },
    true,
  )).map((r) => ({ assetId: str(r['assetId']), note: str(r['note']) }));

  const scenario = str(meta['scenario']);
  return {
    id: str(meta['workspaceId']) || workspaceId,
    revision: num(meta['revision'], 1),
    scenario: (scenario === 'S2' || scenario === 'S3' ? scenario : 'S1') as Workspace['scenario'],
    createdAt: str(meta['createdAt']),
    sites,
    assets,
    windows,
    certifications,
    technicians,
    workOrders,
    parts,
    unknowns,
  };
}

/* --------------------------- guarded mutations ------------------------------- */

async function bumpRevision(g: Graph, wk: string, revision: number, createdAt: string): Promise<number> {
  const rows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     WHERE w.revision = $rev AND w.createdAt = $createdAt
     SET w.revision = w.revision + 1
     RETURN w.revision AS revision`,
    { wk, rev: revision, createdAt },
  );
  if (rows.length === 0) {
    throw new FieldProofError('Workspace changed concurrently; reload and retry', 'stale_revision', 409);
  }
  return num(rows[0]['revision']);
}

export async function editWorkspace(
  workspaceId: string,
  revision: number,
  edit: WorkspaceEdit,
): Promise<Workspace> {
  const { g, wk } = await graphFor(workspaceId);
  const wRows = await run(g, `MATCH (w:Workspace {key:$wk}) RETURN w.createdAt AS createdAt`, { wk }, true);
  if (wRows.length === 0) {
    throw new FieldProofError('Workspace not found', 'workspace_not_found', 404);
  }
  const createdAt = str(wRows[0]['createdAt']);

  if (edit.kind === 'reschedule') {
    const winRows = await run(
      g,
      `MATCH (w:Workspace {key:$wk})-[*1..8]->(win:ShiftWindow {id:$wid}) RETURN win.id AS id`,
      { wk, wid: edit.windowId },
      true,
    );
    if (winRows.length === 0) {
      throw new FieldProofError('Target window does not exist', 'invalid_window', 400);
    }
  }

  await bumpRevision(g, wk, revision, createdAt);

  if (edit.kind === 'assign-technician') {
    // Remove any existing assignment edge on the work order first. Run the
    // delete independently of the create: a single MATCH ... DELETE that finds
    // no edge yields zero rows, which would suppress a CREATE chained after it.
    await run(g, `MATCH ()-[r:ASSIGNED_TO]->(o:WorkOrder {id:$oid}) DELETE r`, {
      oid: edit.workOrderId,
    });
    await run(
      g,
      `MATCH (t2:Technician {id:$tid}), (o2:WorkOrder {id:$oid})
       CREATE (t2)-[:ASSIGNED_TO]->(o2)
       SET o2.assignedTechnicianId = $tid`,
      { tid: edit.technicianId, oid: edit.workOrderId },
    );
  } else if (edit.kind === 'reschedule') {
    await run(
      g,
      `MATCH (o:WorkOrder {id:$oid})-[r:IN_WINDOW]->() DELETE r
       WITH 1 AS ignored
       MATCH (o2:WorkOrder {id:$oid}), (win:ShiftWindow {id:$wid})
       CREATE (o2)-[:IN_WINDOW]->(win)
       SET o2.windowId = $wid`,
      { oid: edit.workOrderId, wid: edit.windowId },
    );
  } else if (edit.kind === 'reserve-part') {
    await run(
      g,
      `MATCH (p:Part {id:$pid})
       SET p.reservedForWorkOrderId = $oid
       WITH 1 AS ignored
       MATCH (o:WorkOrder {id:$oid}), (p2:Part {id:$pid})
       MERGE (o)-[:NEEDS_PART]->(p2)`,
      { pid: edit.partId, oid: edit.workOrderId },
    );
  } else {
    await run(
      g,
      `MATCH (u:Unknown {assetId:$aid}) DETACH DELETE u
       WITH 1 AS ignored
       MATCH (a:Asset {id:$aid})-[:REQUIRES_TASK]->(o:WorkOrder)
       UNWIND $cids AS cid
       MERGE (c:Certification {id: cid})
       ON CREATE SET c.name = cid
       MERGE (o)-[:REQUIRES_CERT]->(c)`,
      { aid: edit.assetId, cids: edit.certificationIds },
    );
  }

  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new FieldProofError('Workspace snapshot failed to rebuild after edit', 'snapshot_failed', 500);
  }
  return rebuilt;
}

export async function approveProposal(
  workspaceId: string,
  revision: number,
  proposalId: string,
  idempotencyKey: string,
  proposalJson = '',
): Promise<{ workspace: Workspace; decision: Decision }> {
  const { g, wk } = await graphFor(workspaceId);

  const existing = await run(
    g,
    `MATCH (d:Decision {idempotencyKey:$key})-[:DECIDED_ON]->(w:Workspace {key:$wk})
     RETURN d.id AS id, d.proposalId AS proposalId, d.approvedAt AS approvedAt, d.revisionAfter AS revisionAfter`,
    { key: idempotencyKey, wk },
    true,
  );
  if (existing.length > 0) {
    const row = existing[0];
    const rebuilt = await readWorkspace(workspaceId);
    if (!rebuilt) {
      throw new FieldProofError('Workspace missing during idempotent replay', 'workspace_not_found', 404);
    }
    return {
      workspace: rebuilt,
      decision: {
        id: str(row['id']),
        proposalId: str(row['proposalId']),
        workspaceRevisionAfter: num(row['revisionAfter'], rebuilt.revision),
        idempotencyKey,
        approvedAt: str(row['approvedAt']),
      },
    };
  }

  const wRows = await run(g, `MATCH (w:Workspace {key:$wk}) RETURN w.createdAt AS createdAt`, { wk }, true);
  if (wRows.length === 0) {
    throw new FieldProofError('Workspace not found', 'workspace_not_found', 404);
  }
  const createdAt = str(wRows[0]['createdAt']);
  const newRevision = await bumpRevision(g, wk, revision, createdAt);

  const decisionId = `dec-${randomUUID().slice(0, 8)}`;
  const approvedAt = new Date().toISOString();
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     CREATE (d:Decision {
       id: $did, proposalId: $pid, idempotencyKey: $key,
       approvedAt: $at, revisionAfter: $rev, proposalJson: $pjson
     })
     CREATE (d)-[:DECIDED_ON]->(w)`,
    { did: decisionId, pid: proposalId, key: idempotencyKey, at: approvedAt, rev: newRevision, pjson: proposalJson, wk },
  );

  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new FieldProofError('Workspace snapshot failed to rebuild after approval', 'snapshot_failed', 500);
  }
  return {
    workspace: rebuilt,
    decision: {
      id: decisionId,
      proposalId,
      workspaceRevisionAfter: newRevision,
      idempotencyKey,
      approvedAt,
    },
  };
}

/* ---------------------------------- memory ---------------------------------- */

export interface MemoryEntry {
  id: string;
  text: string;
  mode: AgentMode;
  at: string;
}

export async function appendMemory(workspaceId: string, text: string, mode: AgentMode): Promise<void> {
  const { g, wk } = await graphFor(workspaceId);
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     CREATE (w)-[:HAS_MEMORY]->(:Memory {id: $id, text: $text, mode: $mode, at: $at})`,
    { wk, id: `mem-${randomUUID().slice(0, 8)}`, text, mode, at: new Date().toISOString() },
  );
}

export interface UsageEntry {
  id: string;
  workspaceId: string;
  provider: string;
  prompt: string;
  response: string;
  at: string;
}

export async function appendUsage(
  workspaceId: string,
  provider: string,
  response: string,
): Promise<void> {
  const { g, wk } = await graphFor(workspaceId);
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     CREATE (u:Usage {id: $id, provider: $provider, response: $response, at: $at})
     CREATE (w)-[:HAS_USAGE]->(u)`,
    { wk, id: `use-${randomUUID().slice(0, 8)}`, provider, response: response.slice(0, 2000), at: new Date().toISOString() },
  );
}

export async function recentMemory(workspaceId: string, limit = 10): Promise<MemoryEntry[]> {
  const { g, wk } = await graphFor(workspaceId);
  const rows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_MEMORY]->(m:Memory)
     RETURN m.id AS id, m.text AS text, m.mode AS mode, m.at AS at
     ORDER BY m.at DESC LIMIT $limit`,
    { wk, limit },
    true,
  );
  return rows.map((row) => {
    const mode = str(row['mode']);
    return {
      id: str(row['id']),
      text: str(row['text']),
      mode: (mode === 'live-groq' || mode === 'live-openrouter' ? mode : 'deterministic') as AgentMode,
      at: str(row['at']),
    };
  });
}

/* ---------------------------------- analysis ---------------------------------- */

export async function analyzeWorkspace(
  workspaceId: string,
  revision: number,
): Promise<{ workspace: Workspace; analysis: Analysis }> {
  const { g, wk } = await graphFor(workspaceId);
  const wRows = await run(g, `MATCH (w:Workspace {key:$wk}) RETURN w.revision AS revision, w.createdAt AS createdAt`, { wk }, true);
  if (wRows.length === 0) {
    throw new FieldProofError('Workspace not found', 'workspace_not_found', 404);
  }
  const metaRevision = Number(wRows[0]['revision']);
  const createdAt = String(wRows[0]['createdAt']);
  if (metaRevision !== revision) {
    throw new FieldProofError('Workspace changed concurrently; reload and retry', 'stale_revision', 409);
  }

  const workspace = await readWorkspace(workspaceId);
  if (!workspace) {
    throw new FieldProofError('Workspace snapshot missing', 'snapshot_failed', 500);
  }

  const analysis = buildAnalysis(workspace);
  const ts = new Date().toISOString();
  const activityText = `Plan checked: ${analysis.check.summary}`;

  // Guarded revision bump + persist proposals + an activity row.
  const bump = await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     WHERE w.revision = $rev AND w.createdAt = $createdAt
     SET w.revision = w.revision + 1
     RETURN w.revision AS revision`,
    { wk, rev: revision, createdAt },
  );
  if (bump.length === 0) {
    throw new FieldProofError('Workspace changed concurrently; reload and retry', 'stale_revision', 409);
  }
  const newRevision = Number(bump[0]['revision']);

  const rows = analysis.proposals.map((p) => ({
    id: p.id, title: p.title, summary: p.summary, revision: newRevision,
    status: p.valid ? 'proposed' : 'rejected', createdAt: ts,
    changesJson: JSON.stringify(p.changes),
  }));
  if (rows.length > 0) {
    await run(
      g,
      `MATCH (w:Workspace {key:$wk})
       WHERE w.revision = $newRev AND w.createdAt = $createdAt
       UNWIND $rows AS pr
       MERGE (p:Proposal {id: pr.id})
       SET p.title = pr.title, p.summary = pr.summary, p.revision = pr.revision,
           p.status = pr.status, p.createdAt = pr.createdAt, p.changes = pr.changesJson
       MERGE (w)-[:HAS_PROPOSAL]->(p)`,
      { wk, newRev: newRevision, createdAt, rows },
    );
  }
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     WHERE w.revision = $newRev AND w.createdAt = $createdAt
     CREATE (a:Activity {id: $aid, text: $text, at: $at})
     CREATE (w)-[:HAS_ACTIVITY]->(a)`,
    { wk, newRev: newRevision, createdAt, aid: `act-${randomUUID().slice(0, 8)}`, text: activityText, at: ts },
  );

  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new FieldProofError('Workspace snapshot failed to rebuild after analysis', 'snapshot_failed', 500);
  }
  return { workspace: rebuilt, analysis };
}

/* ---------------------------------- memory ---------------------------------- */

export async function recallMemory(
  workspaceId: string,
  message: string,
): Promise<{ reply: AgentReply; workspace: Workspace }> {
  const { g, wk } = await graphFor(workspaceId);
  const workspace = await readWorkspace(workspaceId);
  if (!workspace) {
    throw new FieldProofError('Workspace not found', 'workspace_not_found', 404);
  }

  const lower = (message || '').toLowerCase();
  const lines: string[] = [];

  // Surface the current plan status truthfully.
  const check = buildAnalysis(workspace).check;
  lines.push(`Plan status: ${check.ok ? 'All high-risk work orders are covered before the truck rolls.' : 'There are open findings.'}`);
  lines.push(`Workspace revision: ${workspace.revision} (notes do not change it).`);

  // Match work orders / technicians mentioned in the message.
  const matchWorkspaceText = (text: string): string[] => {
    const t = text.toLowerCase();
    const ids: string[] = [];
    for (const o of workspace.workOrders) {
      if (t.includes(o.id) || t.includes(o.title.toLowerCase())) ids.push(o.id);
    }
    for (const tech of workspace.technicians) {
      if (t.includes(tech.id) || t.includes(tech.name.toLowerCase())) ids.push(tech.id);
    }
    for (const asset of workspace.assets) {
      if (t.includes(asset.id) || t.includes(asset.name.toLowerCase())) ids.push(asset.id);
    }
    return [...new Set(ids)];
  };

  const matched = matchWorkspaceText(message);
  if (matched.length > 0) {
    for (const id of matched) {
      const order = workspace.workOrders.find((o) => o.id === id);
      if (order) {
        const tech = order.assignedTechnicianId ? workspace.technicians.find((t) => t.id === order.assignedTechnicianId) : null;
        lines.push(
          `- "${order.title}" (${order.id}) at ${order.siteId}, window ${order.windowId}, status ${order.status}` +
          (tech ? `, assigned to ${tech.name}` : ', unassigned') +
          `, required certs: ${order.requiredCertificationIds.join(', ') || 'none'}`,
        );
      }
      const tech = workspace.technicians.find((t) => t.id === id);
      if (tech) {
        lines.push(
          `- Technician ${tech.name} (${tech.id}): certs ${tech.certifications.map((h) => `${h.certificationId} valid until ${h.validUntil}`).join('; ') || 'none on record'}, ` +
          `max consecutive shifts ${tech.maxConsecutiveShifts}`,
        );
      }
    }
  } else if (lower.includes('unknown') || lower.includes('unclear')) {
    for (const u of workspace.unknowns) {
      lines.push(`- Unknown: ${u.assetId} — ${u.note}`);
    }
  } else {
    lines.push(`No specific work order, technician, or asset matched your note. Mention one for its graph trail.`);
  }

  for (const finding of check.findings.slice(0, 5)) {
    lines.push(`Open finding (${finding.severity}): ${finding.message}`);
  }

  const replyText = lines.join('\n');
  const ts = new Date().toISOString();
  await appendMemory(workspaceId, `Q: ${message}\nA: ${replyText}`, 'deterministic').catch(() => undefined);

  const reply: AgentReply = { mode: 'deterministic', text: replyText, createdAt: ts };
  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new FieldProofError('Workspace snapshot missing after recall', 'snapshot_failed', 500);
  }
  return { reply, workspace: rebuilt };
}

/* ---------------------------------- health ---------------------------------- */

export async function graphHealth(): Promise<boolean> {
  try {
    const client = await getClient();
    const g = client.selectGraph('fieldproof-health');
    const reply = await g.query<{ ok: number }>('RETURN 1 AS ok');
    return (reply.data?.length ?? 0) === 1;
  } catch {
    return false;
  }
}
