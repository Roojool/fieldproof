'use client';

import { useState } from 'react';
import { ArrowUpRight, ArrowRight, Check, Clock3, FileText, Pencil, Sparkles, CircleHelp, Compass } from 'lucide-react';
import type { Analysis, Workspace, WorkspaceEdit } from '@/lib/types';
import type { NavView } from './Nav';

interface Props {
  workspace: Workspace;
  analysis: Analysis | null;
  isChecking: boolean;
  onCheck: () => void;
  onNavigate: (view: NavView) => void;
  onEditWorkspace: (edit: WorkspaceEdit) => Promise<void>;
  onOpenSource: (sourceId?: string) => void;
}

function workOrderCount(workspace: Workspace): number {
  return workspace.workOrders.length;
}

function coveredCount(workspace: Workspace, analysis: Analysis | null): number {
  if (!analysis?.check?.ok) return 0;
  return workspace.workOrders.filter((o) => Boolean(o.assignedTechnicianId)).length;
}

function criticalFindings(analysis: Analysis | null): number {
  return analysis?.check?.findings?.filter((f) => f.severity === 'critical').length ?? 0;
}

function warningFindings(analysis: Analysis | null): number {
  return analysis?.check?.findings?.filter((f) => f.severity === 'warning').length ?? 0;
}

export function DashboardView({ workspace, analysis, isChecking, onCheck, onNavigate, onEditWorkspace, onOpenSource }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: string; workOrderId: string } | null>(null);

  const check = analysis?.check;
  const checked = Boolean(check);
  const ok = check?.ok === true;
  const blocked = checked && !ok;
  const tone = ok ? 'good' : blocked ? 'blocked' : 'pending';

  const woCount = workOrderCount(workspace);
  const covered = coveredCount(workspace, analysis);
  const critical = criticalFindings(analysis);
  const warning = warningFindings(analysis);

  const headline = ok
    ? 'All high-risk work orders are covered before the truck rolls.'
    : blocked
    ? 'Open findings need a change before dispatch.'
    : 'Check the field plan to verify coverage.';

  const diagnosis = ok
    ? `${covered} of ${woCount} work order(s) have an assigned technician with valid certifications.`
    : blocked
    ? `${critical} critical finding(s) and ${warning} warning(s) block safe dispatch.`
    : 'Your sites, assets, work orders, technicians, and shift windows. Check how they fit together before you make a promise.';

  const action = ok ? () => onNavigate('overview') : blocked ? () => onNavigate('conflicts') : onCheck;
  const actionLabel = ok ? 'Review your work' : blocked ? 'See what needs attention' : 'Check this plan';

  const selected = workspace.workOrders.find((o) => o.id === selectedId);
  const tech = selected?.assignedTechnicianId ? workspace.technicians.find((t) => t.id === selected.assignedTechnicianId) : null;
  const window = selected ? workspace.windows.find((w) => w.id === selected.windowId) : null;

  return (
    <div className={`dashboard-wrap dashboard-${tone}`} data-testid="dashboard-view">
      <section className="dashboard-welcome">
        <div>
          <span className="editorial-label">Field desk, at a glance</span>
          <h2>Prove coverage<br /><em>before dispatch.</em></h2>
          <p>A clearer picture of what’s covered, what needs a change, and what happens next.</p>
        </div>
        <div className="dashboard-check-in">
          <span className={`dashboard-state ${tone}`} data-testid="dashboard-status">
            {isChecking ? 'Checking your plan…' : ok ? 'All covered' : blocked ? 'Open findings' : 'Not checked'}
          </span>
          <h3>{headline}</h3>
          <p>{diagnosis}</p>
          <button className="btn-editorial-primary" onClick={action} disabled={isChecking} data-testid="dashboard-next-action">
            {isChecking ? 'Checking…' : actionLabel}
            <ArrowUpRight size={17} />
          </button>
        </div>
      </section>

      <div className="dashboard-stats" aria-label="Plan at a glance">
        <div>
          <span>Work orders</span>
          <strong>{String(woCount).padStart(2, '0')}</strong>
          <small>{workspace.sites.length} site(s) · {workspace.technicians.length} technician(s)</small>
        </div>
        <div>
          <span>Covered orders</span>
          <strong>{String(covered).padStart(2, '0')}</strong>
          <small>{ok ? 'All have valid certification coverage' : 'Some need assignment or certification fix'}</small>
        </div>
        <div>
          <span>Critical findings</span>
          <strong>{String(critical).padStart(2, '0')}</strong>
          <small>{critical > 0 ? 'Blocks dispatch until resolved' : 'No critical blockers'}</small>
        </div>
        <div>
          <span>Saved decisions</span>
          <strong>00</strong>
          <small>Approved plan options are saved here</small>
        </div>
      </div>

      {selected && (
        <aside className="dashboard-job-detail" aria-live="polite" data-testid="dashboard-job-detail">
          <span className="editorial-label">A closer look</span>
          <h4>{selected.title}</h4>
          <p>{window ? `${window.label} (${window.start} → ${window.end})` : `Window ${selected.windowId}`}</p>
          <dl>
            <div>
              <dt>Site</dt>
              <dd>{workspace.sites.find((s) => s.id === selected.siteId)?.name ?? selected.siteId}</dd>
            </div>
            <div>
              <dt>Asset</dt>
              <dd>{workspace.assets.find((a) => a.id === selected.assetId)?.name ?? selected.assetId}</dd>
            </div>
            <div>
              <dt>Assigned technician</dt>
              <dd>{tech ? tech.name : 'Unassigned — cannot dispatch'}</dd>
            </div>
            <div>
              <dt>Required certifications</dt>
              <dd>{selected.requiredCertificationIds.map((cid) => workspace.certifications.find((c) => c.id === cid)?.name ?? cid).join(', ') || 'none'}</dd>
            </div>
            <div>
              <dt>Parts</dt>
              <dd>{selected.partIds.map((pid) => workspace.parts.find((p) => p.id === pid)?.name ?? pid).join(', ') || 'none'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selected.status}</dd>
            </div>
          </dl>
          <button className="btn-editorial-secondary" onClick={() => setEditing({ kind: 'work-order', workOrderId: selected.id })} data-testid="dashboard-edit-work-order">
            <Pencil size={14} /> Edit this work order
          </button>
          {window && (
            <button className="dashboard-source-link" onClick={() => onOpenSource()}>
              <FileText size={14} /> Graph evidence: site → asset → work order → cert → technician
            </button>
          )}
        </aside>
      )}
      {!selected && (
        <div className="paper-card" style={{ padding: '48px 36px', textAlign: 'center', maxWidth: '640px', margin: '40px auto' }}>
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
            Select a work order
          </span>
          <h3 className="editorial-headline" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
            Open a work order to see its graph trail
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', maxWidth: '480px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
            Click any work order in the overview to see its site, asset, required certifications, assigned technician, and parts —
            discovered by real graph traversals, never guessed.
          </p>
        </div>
      )}

      <section aria-labelledby="dashboard-shortcuts-heading" className="dashboard-sections">
        <div className="dashboard-section-top">
          <div>
            <span className="editorial-label">02 / Next steps</span>
            <h3 id="dashboard-shortcuts-heading">One step at a time</h3>
          </div>
          <span className="dashboard-small-note">Clear choices. You stay in charge.</span>
        </div>
        <div className="dashboard-shortcuts">
          {([
            {
              view: 'overview' as NavView,
              icon: Pencil,
              title: 'Work orders',
              text: 'Review each work order, its window, assigned technician, and required certifications.',
              meta: `${woCount} work order(s)`,
            },
            {
              view: blocked ? 'conflicts' : 'overview' as NavView,
              icon: Clock3,
              title: 'Needs attention',
              text: blocked ? 'See the check findings and the reasons behind them.' : 'Review your work orders.',
              meta: critical > 0 ? `${critical} critical finding(s)` : 'All clear',
            },
            {
              view: 'repairs' as NavView,
              icon: Sparkles,
              title: 'Plan options',
              text: 'Compare repair changes and choose what works before you approve.',
              meta: `${analysis?.proposals?.length ?? 0} option(s) ready`,
            },
            {
              view: 'receipts' as NavView,
              icon: Check,
              title: 'Saved decisions',
              text: 'Find approved repairs and the next steps you recorded.',
              meta: 'Approved decisions recorded in FalkorDB',
            },
          ] as const).map(({ view, icon: Icon, title, text, meta }) => (
            <button key={view} onClick={() => onNavigate(view)} className="dashboard-shortcut">
              <span className="shortcut-icon"><Icon size={19} /></span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
                <em>{meta}</em>
              </span>
              <ArrowRight size={19} />
            </button>
          ))}
        </div>
      </section>
      <p className="dashboard-sample-note" data-testid="page-intro">
        FieldProof · {workspace.scenario} scenario · Nothing is dispatched without your approval.
      </p>
      {editing && <div data-testid="edit-modal-placeholder">{editing.kind} edit for {editing.workOrderId}</div>}
    </div>
  );
}
