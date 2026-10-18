# FieldProof worker contract

FieldProof proves every high-risk field work order is covered by a certified, equipped technician before the truck rolls. Read `src/lib/types.ts` as the single source of truth; report any needed change to the orchestrator instead of editing it silently. All fixture data is fictional. No secrets or account details in this repository.

## App API (route handlers under `src/app/api/`)
- `GET /api/workspace` => `{workspace: Workspace}` — load or create the cookie-bound anonymous workspace; never accept a workspace id from the client payload
- `POST /api/analyze` `{revision: number, live?: boolean}` => `{workspace: Workspace, analysis: Analysis}`
- `PATCH /api/workspace` `{revision: number, edit: WorkspaceEdit}` => `{workspace: Workspace}` — optimistic concurrency on `revision`; stale => HTTP 409 `{error: "stale_revision", code: "409"}`
- `POST /api/approve` `{revision: number, proposalId: string, idempotencyKey: string}` => `{workspace: Workspace, decision: Decision}` — idempotent by `idempotencyKey`
- `POST /api/reset` `{}` => `{workspace: Workspace}` — fresh fixture workspace for the selected scenario
- `POST /api/memory` `{message: string, live?: boolean}` => `{reply: AgentReply, workspace: Workspace}` — failover chain Groq -> OpenRouter -> deterministic replay; reply mode is always truthful (`live-groq` | `live-openrouter` | `deterministic`)
- `GET /api/health` => status + public capability booleans (never secrets)
- Errors are `{error: string, code: string}` with HTTP 400/409/429/503. **FalkorDB unreachable => HTTP 503 `{error: "graph_unavailable"}`** — never substitute in-memory business state.

## Backend module exports
- `src/lib/business-setup.ts`: `createFixture(id: string, scenario: ScenarioId): Workspace` + the three scenarios S1/S2/S3 from `.commander/context/02_WAVE_1_FLAGSHIPS.md`
- `src/lib/domain.ts` (100% deterministic, pure): `checkPlan(workspace, changes?, commitmentIds?): CheckResult`, `proposeRepairs(workspace): Proposal[]` (never mutates input; same input => same output, always)
- `src/lib/graph.ts`: `readWorkspace`, `createWorkspace`, `analyzeWorkspace`, `editWorkspace`, `approveProposal`, `recallMemory`, `graphHealth` — FalkorDB client 6.8.0, per-workspace graph key `fieldproof-ws-<opaque-server-id>`, optimistic Cypher guard `WHERE w.revision = $expectedRevision`, dependencies discovered via real traversals, proposals/decisions/memory persisted, snapshot recovery proven
- `src/lib/agents.ts`: live overlay + memory with Groq -> OpenRouter -> deterministic replay; keys only from env; usage persisted in the graph so restarts cannot erase budget

## Hero dataset (S1)
Meridian-7 site: work order W-114 (HV switchgear replacement, window D1-AM) assigned to Dana whose HV certification expires before the window; the only other HV-certified technician on shift, Ravi, must be rejected with evidence (arc-flash kit P-88 conflict + max-consecutive-shift policy). Valid repair: move W-114 to D2-AM after Dana's renewal lands (P-88 reservation moves with it). Approval fact "dana-renewal-completed-early" unlocks D1-PM same-day completion. Unknown cert requirements on legacy assets must surface truthfully as unknowns — never guessed.

## Interface worker ownership
`src/app/**`, `src/components/**` only. Warm Studio Editorial Dark theme cloned from PACT (read-only reference `pact/src/app/globals.css`, `dashboard.css`, `setup.css`). All 12 components: BusinessSetup, DashboardView, OverviewView, HeroBottleneckCard, ConflictEvidenceView, RepairComparisonView, SavedReceiptsView, StudioMemoryView, SourceDrawer, EditModals, Header, SkeletonLoader + `/blog`. Every control functional; truthful status badges; honest unavailable states.

## Boundaries
Only modify assigned files. Never modify `pact/`. Strict TypeScript must compile (`tsc --noEmit`). Deterministic core must not depend on network, clock time, or random. Commit messages: `fieldproof: phase <NN> <name>`; before any commit run `git grep -E "hf_|gsk_|sk-or-v1-"` and require empty output.
