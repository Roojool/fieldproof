'use client';

import React from 'react';
import { Workspace, Analysis, Proposal, RepairChange, RejectedCandidate } from '@/lib/types';
import {
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  FileCheck,
  HelpCircle,
  FileText,
  Play,
} from 'lucide-react';

interface RepairComparisonProps {
  workspace: Workspace | null;
  analysis: Analysis | null;
  onApproveProposal: (proposalId: string) => Promise<void>;
  onOpenSourceDrawer: (sourceId?: string) => void;
  isApproving: boolean;
  onCheckPlan?: () => void;
  isChecking?: boolean;
}

function describeChange(change: RepairChange, workspace: Workspace): string {
  const order = workspace.workOrders.find((o) => o.id === change.workOrderId);
  const title = order?.title ?? 'this work order';
  const win = (id: string) => workspace.windows.find((w) => w.id === id)?.label ?? id;
  const tech = (id: string) => workspace.technicians.find((t) => t.id === id)?.name ?? id;

  if (change.kind === 'reschedule' && change.toWindowId) {
    return `Move "${title}" to ${win(change.toWindowId)}`;
  }
  if (change.kind === 'assign-technician' && change.toTechnicianId) {
    return `Assign ${tech(change.toTechnicianId)} to "${title}"`;
  }
  if (change.kind === 'reserve-part' && change.partId) {
    const part = workspace.parts.find((p) => p.id === change.partId);
    return `Reserve ${part?.name ?? change.partId} for "${title}"`;
  }
  if (change.kind === 'clarify-unknown') {
    return `Clarify certification requirement for ${change.assetId ?? change.workOrderId}`;
  }
  return title;
}

function proposalStatusLabel(proposal: Proposal): { label: string; tone: 'good' | 'attention' | 'neutral' } {
  if (!proposal.valid) return { label: 'Rejected', tone: 'attention' };
  return { label: 'Ready to approve', tone: 'good' };
}

export function RepairComparisonView({ workspace, analysis, onApproveProposal, onOpenSourceDrawer, isApproving, onCheckPlan, isChecking }: RepairComparisonProps) {
  if (!workspace) return null;

  const proposals: Proposal[] = analysis?.proposals ?? [];

  if (proposals.length === 0) {
    return (
      <div className="pact-empty-state paper-card" data-testid="options-empty" style={{ padding: '48px 36px', textAlign: 'center', maxWidth: '680px', margin: '40px auto' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--paper-subtle)',
            border: '1px solid var(--paper-border-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: 'var(--ink-secondary)',
          }}
        >
          <ArrowRightLeft size={24} />
        </div>
        <span className="editorial-label" style={{ color: 'var(--ink-tertiary)', display: 'block', marginBottom: '4px' }}>
          Plan options
        </span>
        <h3 className="editorial-headline" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
          No plan options yet
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', maxWidth: '480px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
          Check the plan to see the repair changes that would make it work. Nothing is approved until you approve it.
        </p>
        {onCheckPlan && (
          <button
            type="button"
            onClick={onCheckPlan}
            disabled={isChecking}
            className="btn-editorial-primary pact-primary-action"
            data-testid="options-check-plan"
            style={{ padding: '8px 22px' }}
          >
            {isChecking ? 'Checking plan…' : 'Check this plan'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '1.5rem', paddingBottom: '4rem' }} data-testid="options-view" data-view="repairs">
      <div className="editorial-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <svg width="38" height="38" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="#C22A08" strokeWidth="3" />
            <path d="M30 50 Q50 15 70 50" fill="none" stroke="#C22A08" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div>
            <span className="editorial-section-number">01</span>
            <span className="editorial-label">Plan options</span>
            <h2 className="editorial-headline" style={{ fontSize: '2.2rem', marginTop: '2px' }}>
              What we can change
            </h2>
          </div>
        </div>
        <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-tertiary)' }}>
          {proposals.length} option(s) evaluated
        </span>
      </div>

      <p style={{ fontSize: '0.92rem', color: 'var(--ink-secondary)', maxWidth: '780px', marginTop: '-12px' }}>
        Each option shows the change, why it helps, and any rejected candidates with evidence. You approve one at a time —
        FieldProof never approves for you.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {proposals.map((proposal, idx) => {
          const { label, tone } = proposalStatusLabel(proposal);
          const isRejected = !proposal.valid;
          const isValid = proposal.valid;
          const canApprove = isValid;

          const rejectedCandidates: RejectedCandidate[] = proposal.rejectedCandidates ?? [];

          return (
            <article
              key={proposal.id}
              className="paper-card pact-option-card"
              data-testid={`option-${proposal.id}`}
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                borderTop: isValid
                  ? '3px solid var(--forest-base)'
                  : '3px solid var(--paper-border-strong)',
                backgroundColor: isValid ? 'var(--forest-light)' : 'var(--paper-surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span className="editorial-section-number">DECISION 0{idx + 1}</span>
                    <span className={`badge-status ${tone === 'good' ? 'ok' : tone === 'attention' ? 'blocked' : 'unknown'}`} data-testid={`option-status-${proposal.id}`} style={{ fontSize: '0.72rem' }}>
                      {isRejected ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                      {label}
                    </span>
                  </div>
                  <h3 className="editorial-headline" style={{ fontSize: '1.25rem' }}>
                    {proposal.title}
                  </h3>
                  {proposal.requiresApprovalFact && (
                    <span
                      className="badge-status unknown"
                      style={{ fontSize: '0.72rem', marginTop: '6px', display: 'inline-block' }}
                    >
                        Requires approval: {proposal.requiresApprovalFact}
                    </span>
                  )}
                </div>
              </div>

              {proposal.changes.length > 0 && (
                <div>
                  <span className="editorial-label" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '8px' }}>
                    The change
                  </span>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {proposal.changes.map((c, cIdx) => {
                      const order = workspace.workOrders.find((o) => o.id === c.workOrderId);
                      return (
                        <li key={cIdx} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          fontSize: '0.84rem',
                          backgroundColor: 'var(--paper-subtle)',
                          padding: '8px 10px',
                          border: '1px solid var(--paper-border)',
                          borderRadius: 'var(--radius-xs)',
                        }}>
                          <span style={{ fontWeight: 600 }}>{describeChange(c, workspace)}</span>
                          {order && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', whiteSpace: 'nowrap' }}>
                              {order.id}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div>
                <span className="editorial-label" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>
                  Why it helps
                </span>
                <p style={{ fontSize: '0.86rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                  {proposal.summary}
                </p>
              </div>

              {rejectedCandidates.length > 0 && (
                <div>
                  <span className="editorial-label" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '8px' }}>
                    Rejected candidates (with evidence)
                  </span>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {rejectedCandidates.map((rc) => {
                      const tech = workspace.technicians.find((t) => t.id === rc.technicianId);
                      return (
                        <li key={rc.technicianId} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          fontSize: '0.84rem',
                          backgroundColor: 'var(--orange-light)',
                          padding: '8px 10px',
                          border: '1px solid var(--orange-border)',
                          borderRadius: 'var(--radius-xs)',
                        }}>
                          <span style={{ fontWeight: 600, color: 'var(--orange-text)' }}>
                            {tech ? tech.name : rc.technicianId}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--orange-text)', maxWidth: '200px' }} title={rc.reason}>
                            {rc.reason}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--paper-border)' }}>
                {canApprove ? (
                  <button
                    type="button"
                    onClick={() => onApproveProposal(proposal.id)}
                    disabled={isApproving}
                    data-testid={`approve-${proposal.id}`}
                    className="btn-editorial-primary pact-primary-action"
                    style={{
                      width: '100%',
                      padding: '9px 16px',
                      opacity: isApproving ? 0.6 : 1,
                      cursor: isApproving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isApproving ? (
                      'Saving approved plan…'
                    ) : (
                      <>
                        <ShieldCheck size={14} />
                        Approve this option
                      </>
                    )}
                  </button>
                ) : isRejected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', color: 'var(--orange-text)', fontSize: '0.84rem', fontWeight: 600 }}>
                    <AlertTriangle size={14} />
                    Rejected — not eligible
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    data-testid={`approve-${proposal.id}`}
                    className="btn-editorial-secondary"
                    style={{
                      width: '100%',
                      padding: '9px 16px',
                      opacity: 0.6,
                      cursor: 'not-allowed',
                    }}
                  >
                    Not eligible for approval
                  </button>
                )}
              </div>

              <details data-testid={`option-details-${proposal.id}`}>
                <summary>Full check &amp; sources</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                    {proposal.summary}
                  </p>
                  {proposal.unlocksOriginalDeadline && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                      This option re-enables the original deadline once the approval fact is confirmed.
                    </p>
                  )}
                  <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--ink-tertiary)' }}>
                    Option id: {proposal.id} · valid: {String(proposal.valid)}
                  </span>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}
