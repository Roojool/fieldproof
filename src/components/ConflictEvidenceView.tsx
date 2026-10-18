'use client';

import React from 'react';
import { Workspace, Analysis, CheckResult } from '@/lib/types';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  FileText,
  ArrowRight,
  GitBranch,
  Compass,
} from 'lucide-react';

interface ConflictEvidenceProps {
  workspace: Workspace | null;
  analysis: Analysis | null;
  onOpenSourceDrawer: (sourceId?: string) => void;
  onNavigateToRepairs: () => void;
  onCheckPlan?: () => void;
  isChecking?: boolean;
}

function formatNodeName(id: string, workspace: Workspace): string {
  const wo = workspace.workOrders.find((item) => item.id === id);
  if (wo) return wo.title;
  const t = workspace.technicians.find((item) => item.id === id);
  if (t) return t.name;
  const a = workspace.assets.find((item) => item.id === id);
  if (a) return a.name;
  const s = workspace.sites.find((item) => item.id === id);
  if (s) return s.name;
  const c = workspace.certifications.find((item) => item.id === id);
  if (c) return c.name;
  const p = workspace.parts.find((item) => item.id === id);
  if (p) return p.name;
  const w = workspace.windows.find((item) => item.id === id);
  if (w) return w.label;
  return id;
}

export function ConflictEvidenceView({ workspace, analysis, onOpenSourceDrawer, onNavigateToRepairs, onCheckPlan, isChecking }: ConflictEvidenceProps) {
  if (!workspace) return null;

  const checkResult: CheckResult | undefined = analysis?.check;

  if (!checkResult) {
    return (
      <div className="pact-empty-state paper-card" data-testid="conflicts-empty" style={{ padding: '48px 36px', textAlign: 'center', maxWidth: '680px', margin: '40px auto' }}>
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
          <Compass size={24} />
        </div>
        <span className="editorial-label" style={{ color: 'var(--ink-tertiary)', display: 'block', marginBottom: '4px' }}>
          Needs attention
        </span>
        <h3 className="editorial-headline" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
          Nothing to review yet
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', maxWidth: '480px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
          Check the plan to see what needs attention: unassigned work orders, expired certifications,
          consecutive-shift violations, and part conflicts across your field-service graph.
        </p>
        {onCheckPlan && (
          <button
            type="button"
            onClick={onCheckPlan}
            disabled={isChecking}
            className="btn-editorial-primary pact-primary-action"
            data-testid="conflicts-check-plan"
            style={{ padding: '8px 22px' }}
          >
            {isChecking ? 'Checking plan…' : 'Check this plan'}
          </button>
        )}
      </div>
    );
  }

  const criticalFindings = checkResult.findings.filter((f) => f.severity === 'critical');
  const warningFindings = checkResult.findings.filter((f) => f.severity === 'warning');
  const hasCritical = criticalFindings.length > 0;
  const hasWarning = warningFindings.length > 0;

  const tone = hasCritical ? 'attention' : hasWarning ? 'unknown' : 'good';
  const StatusIcon = tone === 'good' ? CheckCircle2 : tone === 'attention' ? AlertTriangle : HelpCircle;
  const badgeClass = tone === 'good' ? 'ok' : tone === 'attention' ? 'blocked' : 'unknown';

  const statusLabel =
    checkResult.ok
      ? 'Plan fits'
      : 'Needs a change';

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: '36px', paddingTop: '1.5rem', paddingBottom: '4rem' }} data-testid="conflict-view" data-view="conflicts">
      {/* SECTION 1: DIAGNOSIS & STRONG TYPOGRAPHIC NUMBERS ON PAPER */}
      <section>
        <div className="editorial-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <svg width="38" height="38" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="#C22A08" strokeWidth="3" />
              <path d="M30 50 Q50 15 70 50" fill="none" stroke="#C22A08" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div>
              <span className="editorial-section-number">01</span>
              <span className="editorial-label">Needs attention</span>
              <h2 className="editorial-headline" style={{ fontSize: '2.2rem', marginTop: '2px' }}>
                {checkResult.ok ? 'All work orders are covered' : 'Open findings need attention'}
              </h2>
            </div>
          </div>
          <span
            className={`badge-status ${badgeClass}`}
            data-testid="conflict-status"
            style={{ fontSize: '0.8rem', padding: '4px 12px' }}
          >
            <StatusIcon size={14} />
            {statusLabel}
          </span>
        </div>

        <div
          className="paper-card pact-summary"
          data-testid="conflict-diagnosis"
          style={{
            padding: '24px 28px',
            backgroundColor: 'var(--paper-surface)',
            borderLeft: tone === 'attention' ? '4px solid var(--clay-600)' : tone === 'good' ? '4px solid var(--forest-base)' : '4px solid var(--sunflower-base)',
          }}
        >
          <p style={{ fontSize: '1.02rem', color: 'var(--ink-primary)', lineHeight: 1.55, maxWidth: '820px' }}>
            {checkResult.ok
              ? `Every work order has an assigned technician with valid certifications for its shift window. No critical findings.${hasWarning ? ` ${warningFindings.length} warning(s) to review.` : ''}`
              : `${criticalFindings.length} critical finding(s) block safe dispatch. ${hasWarning ? `${warningFindings.length} warning(s) also need review.` : ''} Fix these before the truck rolls.`
            }
          </p>

          <div
            className="conflict-stat-grid"
            data-testid="conflict-metrics"
          >
            <div className="stat-card">
              <span className="stat-label">Work orders</span>
              <div className="font-serif stat-value" style={{ color: 'var(--ink-primary)' }}>
                {workspace.workOrders.length}
              </div>
            </div>

            <div className="stat-card">
              <span className="stat-label">Critical findings</span>
              <div className="font-serif stat-value" style={{ color: hasCritical ? 'var(--clay-600)' : 'var(--forest-base)' }}>
                {criticalFindings.length}
              </div>
            </div>

            <div className="stat-card stat-card-balance">
              <span className="stat-label">Warnings</span>
              <div className="font-serif stat-value" style={{ color: hasWarning ? 'var(--sand-700)' : 'var(--forest-base)' }}>
                {warningFindings.length}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: FINDINGS BY NAME */}
      {checkResult.findings.length > 0 && (
        <section>
          <div className="editorial-section-header">
            <div>
              <span className="editorial-section-number">02</span>
              <span className="editorial-label">Findings</span>
              <h3 className="editorial-headline" style={{ fontSize: '1.25rem', marginTop: '2px' }}>
                What needs attention
              </h3>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--ink-tertiary)' }}>
              {checkResult.findings.length} finding(s) from the last plan check
            </span>
          </div>

          <ul
            className="pact-source-list"
            data-testid="findings-list"
            style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            {checkResult.findings.map((finding) => (
              <li key={finding.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: finding.severity === 'critical' ? 'var(--orange-light)' : 'var(--sand-50)',
                      color: finding.severity === 'critical' ? 'var(--orange-text)' : 'var(--sand-700)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      flexShrink: 0,
                    }}
                  >
                    {finding.severity === 'critical' ? '!' : '?'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--ink-primary)' }}>
                        {finding.code.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span
                        className={`badge-status ${finding.severity === 'critical' ? 'blocked' : 'unknown'}`}
                        style={{ fontSize: '0.65rem', padding: '1px 6px' }}
                      >
                        {finding.severity}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.86rem', color: 'var(--ink-secondary)', lineHeight: 1.5, margin: 0 }}>{finding.message}</p>
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Evidence: {finding.evidencePath.join(' → ')}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* SECTION 3: ONE CLEAR NEXT ACTION */}
      <section style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button
          type="button"
          onClick={onNavigateToRepairs}
          className={tone === 'good' ? 'btn-editorial-secondary pact-primary-action' : 'btn-editorial-primary pact-primary-action'}
          data-testid="conflict-next-action"
          style={{ padding: '9px 24px', fontSize: '0.88rem' }}
        >
          <span>See plan options</span>
          <ArrowRight size={14} />
        </button>
      </section>

      {/* SECTION 4: GROUNDED EVIDENCE & PROOF CHAINS */}
      <details data-testid="conflict-technical-details">
        <summary>Technical reasoning &amp; evidence paths</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
            Evidence paths show how FieldProof reached this verdict using recorded graph facts. Node ids are preserved
            here for technical audits. Traversal: site → asset → work order → certification → technician.
          </p>

          <div>
            <span className="editorial-label" style={{ fontSize: '0.72rem', display: 'block', marginBottom: '8px' }}>
              Reasoning paths ({checkResult.findings.length})
            </span>
            {checkResult.findings.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {checkResult.findings.map((finding) => (
                  <div key={finding.id} className="paper-card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <GitBranch size={15} style={{ color: finding.severity === 'critical' ? 'var(--clay-600)' : 'var(--sand-700)' }} />
                      <span className="font-mono" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {finding.id}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.86rem', color: 'var(--ink-primary)', lineHeight: 1.5, marginBottom: '12px' }}>{finding.message}</p>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        backgroundColor: 'var(--paper-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        overflowX: 'auto',
                        marginBottom: '12px',
                      }}
                    >
                      <span className="editorial-label" style={{ fontSize: '0.66rem', marginRight: '4px' }}>
                        Traversal:
                      </span>
                      {finding.evidencePath.map((nodeId, nIdx) => (
                        <React.Fragment key={nIdx}>
                          <span
                            className="font-mono"
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              backgroundColor: 'var(--paper-surface)',
                              border: '1px solid var(--paper-border-strong)',
                              borderRadius: 'var(--radius-xs)',
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                            }}
                            title={formatNodeName(nodeId, workspace)}
                          >
                            {formatNodeName(nodeId, workspace)} ({nodeId})
                          </span>
                          {nIdx < finding.evidencePath.length - 1 && (
                            <ArrowRight size={12} style={{ color: 'var(--ink-tertiary)', flexShrink: 0 }} />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.82rem', color: 'var(--ink-tertiary)' }}>
                No reasoning paths were recorded for this check.
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
