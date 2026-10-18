import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FieldProof — Field-Service Work-Order Integrity',
  description: 'How FieldProof proves every high-risk work order is covered by a certified, equipped technician before the truck rolls — on a FalkorDB graph.',
};

export default function BlogPage() {
  return (
    <div className="wrap" style={{ padding: '48px 20px 80px' }}>
      <section style={{ border: '1.5px solid var(--ink-primary)', borderRadius: 'var(--radius-lg)', padding: '40px 48px', background: 'var(--card)' }}>
        <p className="mono" style={{ color: 'var(--clay-700)', marginBottom: '12px', letterSpacing: '0.16em' }}>FieldProof · Engineering Notes</p>
        <h1 className="editorial-headline" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', margin: '0 0 16px 0', lineHeight: '1.05' }}>
          Field-Service Work-Order Integrity on the Graph
        </h1>
        <p style={{ fontSize: '1.05rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch', marginBottom: '24px' }}>
          FieldProof proves every high-risk field work order is covered by a certified, equipped technician before the truck rolls. The plan lives on a
          FalkorDB graph where sites, assets, work orders, certifications, technicians, parts, and shift windows are nodes, and coverage is discovered by
          real traversals — never denormalized foreign keys.
        </p>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', margin: '24px 0 10px 0', color: 'var(--ink-primary)' }}>The hero conflict (fictional)</h2>
        <p style={{ fontSize: '1rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch', marginBottom: '16px' }}>
          Work order W-114 (HV switchgear replacement at Meridian-7, Day 1 AM) is assigned to Dana, whose HV certification expires before the window. The
          only other HV-certified technician, Ravi, cannot take it: his arc-flash kit is committed and the max-consecutive-shifts policy would be breached.
        </p>
        <p style={{ fontSize: '1rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch', marginBottom: '24px' }}>
          The valid repair: move W-114 to Day 2 AM when Dana's renewal lands, carrying the arc-flash reservation with it. Rejected candidates are shown with
          evidence, never silently skipped. An approval fact — "Dana renewal completed early" — re-enables the original same-day deadline.
        </p>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', margin: '24px 0 10px 0', color: 'var(--ink-primary)' }}>Deterministic by design</h2>
        <p style={{ fontSize: '1rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch', marginBottom: '16px' }}>
          The plan checker and repair proposer are pure functions: same input, same output, every time. No clock, no randomness, no in-memory business-state
          fallback. If FalkorDB is unreachable, the API returns 503 — it never guesses.
        </p>
        <p style={{ fontSize: '1rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch' }}>
          Unknown certification requirements on legacy assets surface truthfully as unknowns: the work order stays blocked until clarified, never
          auto-assigned. All fixture data is fictional.
        </p>
      </section>
    </div>
  );
}
