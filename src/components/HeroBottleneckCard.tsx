'use client';

import React from 'react';
import { Workspace, Analysis } from '@/lib/types';
import { describeCheck } from './ui-copy';

interface Props {
  workspace: Workspace | null;
  analysis: Analysis | null;
  onNavigateToConflicts: () => void;
  onNavigateToRepairs: () => void;
  onOpenSourceDrawer: (sourceId?: string) => void;
  onCheckPlan?: () => void;
  isChecking?: boolean;
}

export function HeroBottleneckCard({
  workspace,
  analysis,
  onNavigateToConflicts,
  onNavigateToRepairs,
  onOpenSourceDrawer,
  onCheckPlan,
  isChecking,
}: Props) {
  if (!workspace) return null;

  const check = analysis?.check;
  const criticalFindings = check?.findings.filter((f) => f.severity === 'critical').length ?? 0;
  const blocked = check ? !check.ok : false;
  const covered = check ? check.ok : false;

  const sourceId = check?.findings
    .flatMap((f) => f.evidencePath)
    .find((id) => workspace.workOrders.some((wo) => wo.id === id));

  const copy = check ? describeCheck(check) : null;

  return (
    <section className="hero grain" data-testid="hero-card" aria-labelledby="plan-headline">
      <svg className="land" viewBox="0 0 1440 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <path d="M0 120C240 60 420 90 640 118S1040 70 1240 90S1400 110 1440 100V300H0Z" fill="#35592F" />
        <path d="M0 175C260 140 460 165 700 180S1100 150 1440 170V300H0Z" fill="#1F3B22" />
      </svg>

      <div className="wrap hero-in">
        <p className="mono hero-kicker">Field service · Work-order integrity · FieldProof</p>

        <h1>
          <span className="d">Good work.<br />Better planned.</span>
          <span className="it">before the truck rolls.</span>
        </h1>

        <div className="hero-bot">
          <div className="stack">
            <p className="pact-summary" data-testid="hero-summary">
              {copy?.diagnosis ??
                'Prove every high-risk work order is covered by a certified, equipped technician before the truck rolls.'}
            </p>

            <div className="hero-actions">
              <button
                type="button"
                onClick={() => onOpenSourceDrawer(sourceId)}
                className="pill"
                data-testid="hero-open-sources"
              >
                <svg className="ic"><use href="#ar" /></svg> Read the sources
              </button>

              <a href="#work-orders" className="pill">
                <svg className="ic" style={{ transform: 'rotate(90deg)' }}><use href="#ar" /></svg> View work orders
              </a>
            </div>
          </div>

          <aside className="feat">
            <span
              className="mono"
              style={{
                color: blocked ? 'var(--clay-700)' : covered ? 'var(--forest-base)' : 'var(--ink-tertiary)',
                fontWeight: 700,
              }}
            >
              {covered
                ? 'Plan status · All covered'
                : blocked
                ? 'Plan status · Needs attention'
                : 'Plan status · Ready to check'}
            </span>

            <h2 className="d" id="plan-headline">
              {check ? (
                blocked ? (
                  criticalFindings > 0 ? `${criticalFindings} finding(s) need attention` : 'Needs attention'
                ) : covered ? (
                  'All work orders covered'
                ) : (
                  copy?.headline ?? 'Check complete'
                )
              ) : (
                'Ready to check'
              )}
            </h2>

            <p>
              {check ? (
                blocked ? (
                  `${criticalFindings} critical finding(s) block safe dispatch. Review findings before approving any repair.`
                ) : covered ? (
                  `Every work order has an assigned technician with valid certifications for its shift window.`
                ) : (
                  copy?.diagnosis ?? 'Review plan constraints'
                )
              ) : (
                `${workspace.workOrders.length} work order(s) · ${workspace.technicians.length} technician(s) · ${workspace.sites.length} site(s)`
              )}
            </p>

            <div className="tags">
              <span className="tag">{workspace.workOrders.length} work orders</span>
              <span className="tag">{workspace.technicians.length} technicians</span>
              <span className="tag">
                {check ? (analysis?.mode === 'live-groq' || analysis?.mode === 'live-openrouter' ? 'AI assisted' : 'Rules verified') : 'Awaiting check'}
              </span>
            </div>

            {check ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <button
                  type="button"
                  onClick={onNavigateToRepairs}
                  className="pill red pact-primary-action"
                  data-testid="hero-see-options"
                >
                  <svg className="ic"><use href="#ar" /></svg> See plan options
                </button>
                <button
                  type="button"
                  onClick={onNavigateToConflicts}
                  className="pill"
                  data-testid="hero-see-attention"
                >
                  What needs attention
                </button>
              </div>
            ) : (
              onCheckPlan && (
                <button
                  type="button"
                  onClick={onCheckPlan}
                  disabled={isChecking}
                  className="pill red pact-primary-action"
                  data-testid="hero-check-plan"
                >
                  <svg className="ic"><use href="#ar" /></svg>{' '}
                  {isChecking ? 'Checking plan…' : 'Check this plan'}
                </button>
              )
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
