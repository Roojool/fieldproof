'use client';

import React from 'react';
import { Workspace, Decision } from '@/lib/types';
import {
  CheckCircle2,
  KeyRound,
  FileCheck,
  Clock,
  FileText,
  ArrowUpRight,
} from 'lucide-react';

interface SavedReceiptsProps {
  workspace: Workspace | null;
  decisions: Decision[];
  onOpenSourceDrawer: (sourceId: string) => void;
  onNavigateToOverview: () => void;
}

export function SavedReceiptsView({ workspace, decisions, onOpenSourceDrawer, onNavigateToOverview }: SavedReceiptsProps) {
  if (!workspace) return null;

  if (decisions.length === 0) {
    return (
      <div className="pact-empty-state paper-card" data-testid="receipts-empty" style={{ padding: '48px 36px', textAlign: 'center', maxWidth: '640px', margin: '40px auto' }}>
        <FileCheck size={36} style={{ color: 'var(--ink-tertiary)', margin: '0 auto 12px auto' }} />
        <span className="editorial-label" style={{ color: 'var(--ink-tertiary)', display: 'block', marginBottom: '4px' }}>
          Saved decisions
        </span>
        <h3 className="editorial-headline" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
          Nothing saved yet
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', maxWidth: '440px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
          When you approve a plan option, the decision is recorded here. Nothing is dispatched without your approval.
        </p>
        <button
          type="button"
          onClick={onNavigateToOverview}
          className="btn-editorial-primary pact-primary-action"
          data-testid="receipts-back"
          style={{ padding: '8px 20px', fontSize: '0.85rem' }}
        >
          Go to work orders<ArrowUpRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '1.5rem', paddingBottom: '4rem' }} data-testid="receipts-view" data-view="receipts">
      <div className="editorial-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <svg width="38" height="38" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="#C22A08" strokeWidth="3" />
            <path d="M30 50 Q50 15 70 50" fill="none" stroke="#C22A08" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div>
            <span className="editorial-section-number">01</span>
            <span className="editorial-label">Saved decisions</span>
            <h2 className="editorial-headline" style={{ fontSize: '2.2rem', marginTop: '2px' }}>
              Decisions you have approved
            </h2>
          </div>
        </div>
        <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-tertiary)' }}>
          {decisions.length} recorded decision(s)
        </span>
      </div>

      <p style={{ fontSize: '0.92rem', color: 'var(--ink-secondary)', maxWidth: '780px', marginTop: '-12px' }}>
        Each entry below is an approval recorded in FalkorDB. Approving never publishes or contacts anyone.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {decisions.map((decision) => {
          const order = workspace.workOrders.find((o) => o.id === decision.proposalId);
          return (
            <article
              key={decision.id}
              className="paper-card"
              data-testid={`receipt-${decision.id}`}
              style={{
                padding: '28px',
                borderLeft: '4px solid var(--forest-base)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span className="badge-status feasible" style={{ fontSize: '0.72rem' }}>
                    <CheckCircle2 size={12} />
                    Approved
                  </span>
                  <h3 className="editorial-headline" style={{ fontSize: '1.3rem', marginTop: '8px' }}>
                    {order ? order.title : `Proposal ${decision.proposalId}`}
                  </h3>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-tertiary)' }}>
                  <div>Saved {new Date(decision.approvedAt).toLocaleString()}</div>
                  <div className="font-mono" style={{ marginTop: '4px' }}>Revision r{decision.workspaceRevisionAfter}</div>
                </div>
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Idempotency key: {decision.idempotencyKey}
              </div>

              <details className="pact-detail-toggle" data-testid={`receipt-details-${decision.id}`}>
                <summary>Technical details</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px', fontSize: '0.72rem', color: 'var(--ink-tertiary)' }}>
                  <div className="font-mono" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <KeyRound size={11} />
                    <span>Idempotency key: {decision.idempotencyKey}</span>
                  </div>
                  <span className="font-mono">
                    Decision id: {decision.id} · plan revision r{decision.workspaceRevisionAfter}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenSourceDrawer(decision.proposalId)}
                    className="btn-editorial-secondary"
                    style={{ padding: '1px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}
                  >
                    <FileText size={11} />
                    View graph evidence
                  </button>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}
