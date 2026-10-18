'use client';

import React, { useState } from 'react';
import {
  Clock,
  Calendar,
  Edit2,
  FileText,
  Check,
  X,
  HelpCircle,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type { Workspace, Analysis, WorkspaceEdit } from '@/lib/types';

interface OverviewViewProps {
  workspace: Workspace | null;
  analysis: Analysis | null;
  onEditWorkspace: (edit: WorkspaceEdit) => Promise<void>;
  onOpenSourceDrawer: (sourceId?: string) => void;
}

function certName(workspace: Workspace | null, id: string): string {
  return workspace?.certifications.find((c) => c.id === id)?.name ?? id;
}

function techName(workspace: Workspace | null, id: string | null): string {
  if (!id) return 'Unassigned';
  return workspace?.technicians.find((t) => t.id === id)?.name ?? id;
}

function windowLabel(workspace: Workspace | null, id: string): string {
  return workspace?.windows.find((w) => w.id === id)?.label ?? id;
}

function coverageStatus(workspace: Workspace | null, order: Workspace['workOrders'][number], analysis: Analysis | null): { ok: boolean; message: string; tone: 'good' | 'blocked' | 'unknown' } {
  if (!workspace || !analysis) return { ok: false, message: 'Not checked yet', tone: 'unknown' };
  const finding = analysis.check.findings.find(
    (f) => f.evidencePath.includes(order.id) && f.severity === 'critical'
  );
  if (!order.assignedTechnicianId) return { ok: false, message: 'No technician assigned', tone: 'blocked' };
  if (finding) return { ok: false, message: finding.message, tone: 'blocked' };
  const warning = analysis.check.findings.find((f) => f.evidencePath.includes(order.id) && f.severity === 'warning');
  if (warning) return { ok: true, message: warning.message, tone: 'unknown' };
  return { ok: true, message: 'Covered — valid certifications for this window', tone: 'good' };
}

export function OverviewView({ workspace, analysis, onEditWorkspace, onOpenSourceDrawer }: OverviewViewProps) {
  if (!workspace) return null;

  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAssign = async (orderId: string, technicianId: string) => {
    try {
      await onEditWorkspace({ kind: 'assign-technician', workOrderId: orderId, technicianId });
    } catch {
      // Error handled and displayed in parent ErrorAlert banner
    }
  };

  const handleUnassign = async (orderId: string) => {
    try {
      await onEditWorkspace({ kind: 'assign-technician', workOrderId: orderId, technicianId: 'none' });
    } catch {
      // Error handled and displayed in parent ErrorAlert banner
    }
  };

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: '36px', paddingTop: '1.5rem', paddingBottom: '4rem' }} data-testid="overview-view" data-view="overview">
      <div id="work-orders" style={{ scrollMarginTop: '80px' }} />

      {/* SECTION 1: WORK ORDERS */}
      <section>
        <div className="editorial-section-header">
          <div>
            <span className="editorial-section-number">01</span>
            <span className="editorial-label">Work orders</span>
            <h2 className="editorial-headline" style={{ fontSize: '2.2rem', marginTop: '2px' }}>
              Field service work orders
            </h2>
          </div>
          <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-tertiary)' }}>
            {workspace.workOrders.length} work order(s) across {workspace.sites.length} site(s)
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '16px' }}>
          {workspace.workOrders.map((order) => {
            const site = workspace.sites.find((s) => s.id === order.siteId);
            const asset = workspace.assets.find((a) => a.id === order.assetId);
            const win = workspace.windows.find((w) => w.id === order.windowId);
            const status = coverageStatus(workspace, order, analysis);
            const isEditing = editingId === order.id;

            return (
              <div key={order.id} className="paper-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div
                  className="grain"
                  style={{
                    position: 'relative',
                    height: '38px',
                    background: `linear-gradient(135deg, #C22A08, #FFA81C)`,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 14px',
                    borderBottom: '1.5px solid var(--ink)',
                  }}
                >
                  <span className="mono" style={{ position: 'relative', zIndex: 2, fontSize: '0.68rem', color: '#FFFFFF', letterSpacing: '0.12em', fontWeight: 700, backgroundColor: 'rgba(14, 11, 8, 0.45)', padding: '2px 8px', borderRadius: 'var(--radius-xs)' }}>
                    {order.id}
                  </span>
                  <span className="mono" style={{ position: 'relative', zIndex: 2, fontSize: '0.64rem', color: 'rgba(255, 255, 255, 0.9)', letterSpacing: '0.08em' }}>
                    {site?.region ?? '—'}
                  </span>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: status.tone === 'good' ? 'var(--forest-light)' : status.tone === 'blocked' ? 'var(--orange-light)' : 'var(--sand-50)',
                          color: status.tone === 'good' ? 'var(--forest-base)' : status.tone === 'blocked' ? 'var(--orange-text)' : 'var(--sand-700)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                        }}
                      >
                        {order.id.slice(-2).toUpperCase()}
                      </div>
                      <div>
                        <h3 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--ink-primary)' }}>{order.title}</h3>
                        <div style={{ fontSize: '0.74rem', color: 'var(--ink-tertiary)' }}>
                          {asset?.name ?? order.assetId} · {site?.name ?? order.siteId}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`badge-status ${status.tone === 'good' ? 'ok' : status.tone === 'blocked' ? 'blocked' : 'unknown'}`}
                      style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                    >
                      {status.tone === 'good' ? 'Covered' : status.tone === 'blocked' ? 'Blocked' : 'Unknown'}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      padding: '10px 12px',
                      backgroundColor: 'var(--paper-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--ink-tertiary)', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Window</span>
                      <span style={{ fontWeight: 600 }}>{win ? `${win.label} (${win.start} → ${win.end})` : order.windowId}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-tertiary)', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assigned</span>
                      <span style={{ fontWeight: 600 }}>{techName(workspace, order.assignedTechnicianId)}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-tertiary)', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Certifications</span>
                      <span style={{ fontWeight: 600 }}>{order.requiredCertificationIds.map((cid) => certName(workspace, cid)).join(', ') || 'none'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-tertiary)', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Parts</span>
                      <span style={{ fontWeight: 600 }}>{order.partIds.map((pid) => workspace.parts.find((p) => p.id === pid)?.name ?? pid).join(', ') || 'none'}</span>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', lineHeight: 1.5, margin: 0 }}>{status.message}</p>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select
                          value={order.assignedTechnicianId ?? ''}
                          onChange={(e) => {
                            const tid = e.target.value || 'none';
                            handleAssign(order.id, tid);
                            setEditingId(null);
                          }}
                          className="editorial-input"
                          style={{ fontSize: '0.78rem', padding: '6px 10px', flex: 1 }}
                        >
                          <option value="">Unassign</option>
                          {workspace.technicians.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setEditingId(null)} className="btn-editorial-secondary" style={{ padding: '0 10px', fontSize: '0.72rem' }}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingId(order.id)}
                          className="btn-editorial-secondary"
                          style={{ flex: 1, padding: '5px 10px', fontSize: '0.75rem' }}
                          data-testid={`assign-tech-${order.id}`}
                        >
                          <Edit2 size={12} />
                          {order.assignedTechnicianId ? 'Change technician' : 'Assign technician'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenSourceDrawer()}
                          className="btn-editorial-secondary"
                          style={{ padding: '5px 8px', fontSize: '0.75rem' }}
                          title="View graph evidence"
                        >
                          <FileText size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* OPTIONAL TECHNICAL DETAILS */}
      <section>
        <details data-testid="overview-technical-details">
          <summary>How FieldProof checks coverage</summary>
          <div
            className="pact-inline-note"
            style={{
              marginTop: '10px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.8rem',
              color: 'var(--ink-secondary)',
            }}
          >
            <ShieldCheck size={15} style={{ color: 'var(--ink-tertiary)', flexShrink: 0 }} />
            <span>
              FieldProof checks each work order by traversing the graph: site → asset → work order →
              required certification → assigned technician. A certification must be valid at the start of
              the shift window. It never guesses a duration or an eligibility.
            </span>
          </div>
        </details>
      </section>
    </div>
  );
}
