// FieldProof — canonical Cypher pack (reference queries used by src/lib/graph.ts).
// Graph key per workspace: fieldproof-ws-<opaque-server-id>

// ---------- Schema (created per workspace graph) ----------
// (w:Workspace {key, revision, createdAt, scenario})
// (w)-[:HAS_SITE]->(s:Site {id, name, region})
// (s)-[:HAS_ASSET]->(a:Asset {id, name, criticality})
// (a)-[:REQUIRES_TASK]->(o:WorkOrder {id, title, windowId, etaHours, status, assignedTechnicianId})
// (o)-[:REQUIRES_CERT]->(c:Certification {id, name})
// (o)-[:NEEDS_PART]->(p:Part {id, name, quantity, reservedForWorkOrderId})
// (w)-[:HAS_WINDOW]->(win:ShiftWindow {id, label, day, start, end})
// (o)-[:IN_WINDOW]->(win)
// (t:Technician {id, name, homeSiteId, maxConsecutiveShifts})
// (t)-[:ASSIGNED_TO]->(o)
// (t)-[:HOLDS {validUntil}]->(c)
// (w)-[:HAS_UNKNOWN]->(u:Unknown {assetId, note})
// (d:Decision {id, proposalId, idempotencyKey, approvedAt, revisionAfter, proposalJson})-[:DECIDED_ON]->(w)
// (w)-[:HAS_MEMORY]->(m:Memory {id, text, mode, at})

// ---------- Guarded mutation (optimistic concurrency; one atomic writer wins) ----------
// MATCH (w:Workspace {key:$wk})
// WHERE w.revision = $rev AND w.createdAt = $createdAt
// SET w.revision = w.revision + 1
// RETURN w.revision AS revision
// Empty result => HTTP 409 stale_revision

// ---------- Hero conflict (S1): expired certification under the assigned window ----------
// Site -> Asset -> WorkOrder -> required cert -> technician holding it (validity check)
MATCH (w:Workspace {key:$wk})
MATCH (w)-[:HAS_SITE]->(s:Site)-[:HAS_ASSET]->(a:Asset)-[:REQUIRES_TASK]->(o:WorkOrder)
MATCH (o)-[:IN_WINDOW]->(win:ShiftWindow)
MATCH (o)-[:REQUIRES_CERT]->(c:Certification)
MATCH (t:Technician)-[:ASSIGNED_TO]->(o)
MATCH (t)-[h:HOLDS]->(c)
WHERE h.validUntil < win.start
RETURN s.name AS site, a.name AS asset, o.id AS workOrder, o.title AS task,
       win.label AS window, t.name AS technician, c.name AS certification,
       h.validUntil AS validUntil,
       [s.id, a.id, o.id, c.id, t.id] AS evidencePath

// ---------- Alternative technicians who legally hold every required cert for a window ----------
MATCH (w:Workspace {key:$wk})
MATCH (o:WorkOrder {id:$workOrderId})-[:REQUIRES_CERT]->(c:Certification)<-[h:HOLDS]-(t:Technician)
MATCH (o)-[:IN_WINDOW]->(win:ShiftWindow)
WHERE h.validUntil >= win.start AND t.id <> $excludeTechnicianId
WITH o, t, collect(c.id) AS covered
WHERE size(covered) = size([(o)-[:REQUIRES_CERT]->(rc) | rc.id])
RETURN t.id, t.name, covered

// ---------- Part reservation conflicts (single reserved unit, two orders) ----------
MATCH (w:Workspace {key:$wk})
MATCH (o1:WorkOrder)-[:NEEDS_PART]->(p:Part)<-[:NEEDS_PART]-(o2:WorkOrder)
WHERE id(o1) < id(o2) AND p.quantity < 2
RETURN p.id, p.name, o1.id AS orderA, o2.id AS orderB

// ---------- Snapshot rebuild (graph-native; no denormalized foreign keys trusted) ----------
MATCH (w:Workspace {key:$wk}) RETURN w
MATCH (w:Workspace {key:$wk})-[:HAS_SITE]->(s) RETURN s ORDER BY s.id
MATCH (w:Workspace {key:$wk})-[:HAS_SITE]->()-[:HAS_ASSET]->(a) RETURN a ORDER BY a.id
MATCH (w:Workspace {key:$wk})-[:HAS_SITE]->()-[:HAS_ASSET]->()-[:REQUIRES_TASK]->(o) RETURN o ORDER BY o.id
MATCH (w:Workspace {key:$wk})-[*1..8]->(win:ShiftWindow) RETURN DISTINCT win ORDER BY win.id
MATCH (w:Workspace {key:$wk})-[*1..8]->(c:Certification) RETURN DISTINCT c ORDER BY c.id
MATCH (w:Workspace {key:$wk})-[*1..3]->(t:Technician) RETURN DISTINCT t ORDER BY t.id
MATCH (w:Workspace {key:$wk})-[*1..2]->(p:Part) RETURN DISTINCT p ORDER BY p.id
MATCH (w:Workspace {key:$wk})-[:HAS_UNKNOWN]->(u) RETURN u ORDER BY u.assetId
MATCH (t:Technician)-[h:HOLDS]->(c:Certification)
WHERE EXISTS { MATCH (w:Workspace {key:$wk})-[*1..3]->(t) }
RETURN t.id AS technicianId, c.id AS certificationId, h.validUntil AS validUntil

// ---------- Technician assignments (edge, not property, is the source of truth) ----------
MATCH (t:Technician)-[r:ASSIGNED_TO]->(o:WorkOrder)
WHERE EXISTS { MATCH (w:Workspace {key:$wk})-[*1..3]->(t) }
RETURN t.id AS technicianId, o.id AS workOrderId

// ---------- Idempotent decision receipt ----------
MATCH (d:Decision {idempotencyKey:$key})-[:DECIDED_ON]->(w:Workspace)
RETURN d.id, d.proposalId, d.approvedAt, d.revisionAfter, w.key

// ---------- Memory log (bounded recency) ----------
MATCH (w:Workspace {key:$wk})-[:HAS_MEMORY]->(m:Memory)
RETURN m.id, m.text, m.mode, m.at ORDER BY m.at DESC LIMIT $limit
