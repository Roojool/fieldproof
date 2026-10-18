# FieldProof — Hackathon Submission Pack

**Project:** `fieldproof` (FieldProof) — Wave 1 flagship  
**Slug:** `fieldproof`  
**Domain:** Field-service work-order integrity  
**Owner org:** Roojool  
**Active phase:** `06_DOCKER_DEPLOY_VIDEO_AND_SUBMISSION_PACK`  
**Shared FalkorDB:** `redis://127.0.0.1:16380` (never port 16379 / pact-preflight)

---

## Pitch

Prove every high-risk field work order is covered by a certified, equipped technician — before the truck rolls. FieldProof runs the PACT parity stack on a FalkorDB graph: sites, assets, work orders, certifications, technicians, parts, and shift windows, with deterministic plan checking, optimistic-concurrency edits, idempotent repair approvals, and truthful agent memory (Groq → OpenRouter → deterministic replay).

## Hero conflict (scenario S1)

Work order **W-114** (HV switchgear replacement, Site Meridian-7, window D1-AM) is assigned to Technician **Dana**, whose HV certification expires **before** the window. The only other on-shift HV-certified technician, **Ravi**, is a **rejected candidate** with evidence (arc-flash kit P-88 is a single reserved unit + max-consecutive-shift policy). The valid repair: move W-114 to window D2-AM once Dana's pre-scheduled renewal lands (P-88 reservation moves with it). Approval fact `"dana-renewal-completed-early"` unlocks D1-PM same-day completion.

Unknown certification requirements on legacy assets surface truthfully as `unknown` — never guessed.

## Three scenarios (fixtures)

| Scenario | Conflict | Valid repair |
|---|---|---|
| S1 (hero) | Dana's HV cert expires before W-114's window | Reschedule W-114 to D2-AM; P-88 moves with it |
| S2 | Two rural sites share one insulated-lift truck, double-booked | Resequence by drive-time |
| S3 | Legacy assets with UNKNOWN cert requirements | Truthful "unknown"; block until clarified |

## Stack (cloned verbatim from PACT)

```json
{
  "dependencies": { "falkordb": "6.8.0", "lucide-react": "1.57.0", "next": "16.4.1", "react": "19.3.1", "react-dom": "19.3.1", "zod": "4.6.7" },
  "devDependencies": { "@types/node": "26.6.5", "@types/react": "19.3.0", "@types/react-dom": "19.3.0", "playwright-core": "^1.64.1", "tsx": "4.23.15", "typescript": "7.0.2" }
}
```

Scripts: `dev` / `build` / `start` / `typecheck` (`tsc --noEmit`) / `test` (unit) / `test:integration` (FalkorDB at 16380).

## App API (`src/app/api/[action]/route.ts`)

- `GET /api/workspace` — load or create cookie-bound anonymous workspace (id never accepted from client)
- `POST /api/analyze` `{revision, live?}` — deterministic plan check (+ optional live LLM overlay)
- `PATCH /api/workspace` `{revision, edit}` — optimistic concurrency; stale ⇒ HTTP 409 `stale_revision`
- `POST /api/approve` `{revision, proposalId, idempotencyKey}` — idempotent repair approval
- `POST /api/reset` — fresh fixture workspace
- `POST /api/memory` `{message, live?}` — agent memory Q&A (truthful mode badge)
- `GET /api/health` — status + public capability booleans (never secrets)
- FalkorDB unreachable ⇒ HTTP 503 `{error:"graph_unavailable"}` — no in-memory business-state substitute

## Mandatory UI (12 React 19 components + /blog)

`BusinessSetup`, `DashboardView`, `OverviewView`, `HeroBottleneckCard`, `ConflictEvidenceView`, `RepairComparisonView`, `SavedReceiptsView`, `StudioMemoryView`, `SourceDrawer`, `EditModals`, `Header`, `SkeletonLoader` + `src/app/blog/page.tsx`. Warm Studio Editorial Dark theme cloned from PACT (read-only reference).

## Phase 06 deliverables (DOCKER_DEPLOY_VIDEO_AND_SUBMISSION_PACK)

| Deliverable | Path / Target | Status |
|---|---|---|
| Playwright demo video | `demos/fieldproof-demo.webm` | recorded via `scripts/record-demo.mjs` |
| Dockerfile | `Dockerfile` | written |
| Compose | `compose.yaml` | written (app + FalkorDB) |
| GitHub repo | `Roojool/fieldproof` | push target |
| HF Space (Docker) | `roojool/fieldproof` | push target |
| Vercel deploy | `fieldproof` | deploy target |
| Submission pack | `SUBMISSION_PACK.md` | this file |
| Rollup tracker | `ALL_SUBMISSIONS_READY.md` | workspace root |
| Phase marker | `.phase_06_DOCKER_DEPLOY_VIDEO_AND_SUBMISSION_PACK.done` | created on completion |

## Local development

```bash
cd falkordb-suite/fieldproof
npm install          # node_modules already present
cp .env.local.example .env.local   # .env.local is gitignored; FALKORDB_URL=redis://127.0.0.1:16380
npm run dev          # http://127.0.0.1:3000
npm run typecheck
npm run test
npm run test:integration   # needs FalkorDB at 16380
npm run build
```

## Docker

```bash
docker build -t roojool/fieldproof .
docker run -p 3000:3000 --env-file .env.local roojool/fieldproof
# or:
docker compose up
```

## Secrets handling

Runtime secrets (`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `SESSION_SECRET`, HF write token) live **only** in `.env.local` (gitignored) and `.commander/secrets.env`. They are **never printed, never committed**. Before any git commit: `git grep -E "hf_|gsk_|sk-or-v1-"` must return empty.

## Data

All fixture data, sites, technicians, certifications, and work orders are fictional.
