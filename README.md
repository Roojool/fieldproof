# FieldProof

**Prove every high-risk field work order is covered by a certified, equipped technician — before the truck rolls.**

FieldProof runs the PACT-parity stack (Next.js 16.4.1 · React 19.3.1 · FalkorDB 6.8.0 · zod 4.6.7 · TypeScript 7) over a per-workspace FalkorDB graph of sites → assets → work orders → certifications ← technicians (with per-technician validity windows), parts and shift windows. The deterministic domain core finds multi-hop scheduling conflicts, proposes lawful repairs with evidence, records idempotent approval receipts, and answers operator questions with a truthful Groq → OpenRouter → deterministic-replay failover chain.

## The hero scenario (S1)

Work order **W-114** (HV switchgear replacement at Meridian-7, window Day 1 AM) is assigned to **Dana**, whose HV certification expires before the window. The only other HV-certified technician, **Ravi**, must be *rejected with evidence* (already holds two overlapping shifts against a max of two; the single arc-flash kit is committed elsewhere). The lawful repair moves W-114 to Day 2 AM, after Dana's scheduled renewal takes effect. An **approval fact** — renewal completed *early* — re-enables a same-day completion, keeping the original deadline intact. A legacy asset with *unknown* certification requirements is surfaced as an unknown, never guessed.

Three fixtures ship: **S1** the certification conflict above, **S2** two rural sites sharing one single-unit insulated-lift truck in overlapping windows (repaired by resequencing), **S3** an asset whose requirements are genuinely unknown (blocked from auto-assignment until clarified).

## Stack & contracts

- `src/lib/graph.ts` — per-workspace graph keys (`fieldproof-ws-<opaque-server-id>`), atomic optimistic mutations (`WHERE w.revision = $rev AND w.createdAt = $createdAt`, losers get `409 stale_revision`), traversal-only snapshot rebuilds, idempotent decision receipts (`idempotencyKey`), persisted memory. FalkorDB unreachable ⇒ HTTP **503 `graph_unavailable`** — never in-memory business state.
- `src/lib/domain.ts` — 100% deterministic: `checkPlan` / `proposeRepairs` are pure (no clock, no network, no randomness). Same input ⇒ same output, always.
- `src/lib/agents.ts` — truthful failover: `live-groq` → `live-openrouter` → `deterministic`, with the mode badge shown in the UI.
- API: `GET /api/workspace`, `POST /api/analyze`, `PATCH /api/workspace`, `POST /api/approve`, `POST /api/reset`, `POST /api/memory`, `GET /api/health` — anonymous cookie-bound workspaces; workspace IDs are never accepted from client payloads.
- UI: Warm Studio Editorial Dark theme, 12 components (`BusinessSetup`, `DashboardView`, `OverviewView`, `HeroBottleneckCard`, `ConflictEvidenceView`, `RepairComparisonView`, `SavedReceiptsView`, `StudioMemoryView`, `SourceDrawer`, `EditModals`, `Header`, `SkeletonLoader`) + `/blog`.

## Run locally

```bash
npm install
# .env.local (gitignored): FALKORDB_URL=redis://127.0.0.1:16380, GROQ_API_KEY=…, OPENROUTER_API_KEY=…
npm run dev        # http://127.0.0.1:3000
```

Shared FalkorDB for the whole hackathon suite:

```bash
docker run -d --name falkordb-commander-shared -p 127.0.0.1:16380:6379 -v falkordb_commander_data:/var/lib/falkordb/data falkordb/falkordb:latest
```

All-in-one container (FalkorDB + Next.js on port 7860, HF Spaces contract):

```bash
docker compose up --build      # see Dockerfile / compose.yaml
```

## Verify

```bash
npm run typecheck   # tsc --noEmit (strict)
npm test            # tsx --test tests/*.test.ts
npm run test:integration        # against FalkorDB on 127.0.0.1:16380
npm run build
```

## Demo & links

- Demo video: `demos/fieldproof-demo.webm` — 1920×1080, ~72 s, recorded against a live FalkorDB covering setup → analyze → conflict evidence → repair comparison → approve → receipts → memory → blog.
- Live app: `https://fieldproof-lilac.vercel.app`
- Repository: `https://github.com/Roojool/fieldproof`
- Submission details: `SUBMISSION_PACK.md`

All fixture data is fictional. Architecture derived from the PACT studio stack; credentials are never committed (`.env.local` is gitignored).
