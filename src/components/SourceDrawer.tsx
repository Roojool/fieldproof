'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, FileText, Layers } from 'lucide-react';

interface SourceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sources: { id: string; title: string; excerpt: string }[];
  activeSourceId: string | null;
  onSelectSource: (sourceId: string) => void;
}

export function SourceDrawer({ isOpen, onClose, sources, activeSourceId, onSelectSource }: SourceDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<string>('all');
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const searchInput = panel.querySelector<HTMLInputElement>('input[type="text"]');
      if (searchInput) {
        searchInput.focus();
      } else {
        panel.focus();
      }
    }, 20);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredSources = sources.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const selectedSource = activeSourceId ? sources.find((s) => s.id === activeSourceId) || null : null;

  return (
    <div
      className="source-drawer-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Records behind this field plan"
      data-testid="source-drawer"
    >
      <div
        ref={panelRef}
        className="source-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--paper-border-strong)',
            backgroundColor: 'var(--paper-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span className="editorial-label" style={{ color: 'var(--clay-700)' }}>
              The records behind this plan
            </span>
            <h2 className="editorial-headline" style={{ fontSize: '1.25rem', marginTop: '2px' }}>
              Sources
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-editorial-secondary"
            style={{ padding: '6px', borderRadius: '50%' }}
            aria-label="Close drawer"
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid var(--paper-border)',
            backgroundColor: 'var(--paper-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ position: 'relative' }}>
            <SearchIcon />
            <input
              type="text"
              placeholder="Search records…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="editorial-input"
              style={{ paddingLeft: '32px', fontSize: '0.82rem' }}
              aria-label="Search sources"
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'All sources' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterKind(key)}
                className={`badge-status ${filterKind === key ? 'deterministic' : 'neutral'}`}
                data-testid={`source-filter-${key}`}
                style={{
                  cursor: 'pointer',
                  border: filterKind === key ? '1px solid var(--ink-primary)' : '1px solid var(--paper-border)',
                  backgroundColor: filterKind === key ? 'var(--ink-primary)' : 'var(--paper-surface)',
                  color: filterKind === key ? '#FFFFFF' : 'var(--ink-secondary)',
                  padding: '3px 8px',
                }}
              >
                {label}
              </button>
            ))}
            <span style={{ fontSize: '0.7rem', color: 'var(--ink-tertiary)', fontStyle: 'italic' }}>
              FieldProof evidence is graph-derived (site → asset → work order → certification → technician).
              There are no document sources to open.
            </span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {selectedSource ? (
            <div
              style={{
                padding: '24px',
                borderBottom: '2px solid var(--paper-border-strong)',
                backgroundColor: 'var(--paper-surface)',
              }}
            >
              <span className="badge-status neutral">
                <FileText size={14} style={{ color: 'var(--ink-secondary)', marginRight: '6px' }} />
                Graph record
              </span>
              <h3 className="editorial-headline" style={{ fontSize: '1.15rem', marginBottom: '10px' }}>
                {selectedSource.title}
              </h3>
              <div
                style={{
                  backgroundColor: 'var(--paper-subtle)',
                  border: '1px solid var(--paper-border)',
                  borderLeft: '3px solid var(--clay-600)',
                  padding: '16px',
                  borderRadius: 'var(--radius-xs)',
                  fontFamily: 'var(--font-serif)',
                  fontSize: '0.95rem',
                  lineHeight: '1.6',
                  color: 'var(--ink-primary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selectedSource.excerpt}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--paper-border)',
                backgroundColor: 'var(--paper-surface)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: 'var(--paper-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink-secondary)',
                }}
              >
                <Layers size={18} />
              </div>
              <div>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 600 }}>Graph-derived evidence</h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                  FieldProof discovers coverage through real graph traversals — site → asset → work order →
                  certification → technician. There are no document sources to open; every finding shows its
                  evidence path inline in the Needs attention view.
                </p>
              </div>
            </div>
          )}

          <div style={{ padding: '18px 24px' }}>
            <span className="editorial-subhead" style={{ display: 'block', marginBottom: '12px', fontSize: '0.75rem' }}>
              Records ({filteredSources.length})
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredSources.map((source) => {
                const isSelected = selectedSource?.id === source.id;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onSelectSource(source.id)}
                    data-testid={`source-item-${source.id}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      textAlign: 'left',
                      padding: '12px 14px',
                      backgroundColor: isSelected ? 'var(--paper-surface)' : 'transparent',
                      border: isSelected ? '1px solid var(--clay-600)' : '1px solid var(--paper-border)',
                      borderRadius: 'var(--radius-xs)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
                        <FileText size={14} style={{ color: 'var(--ink-secondary)', flexShrink: 0 }} />
                        {source.title}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--ink-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {source.excerpt}
                    </p>
                  </button>
                );
              })}
              {filteredSources.length === 0 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-tertiary)', padding: '12px 0' }}>
                  No sources match your search.
                </p>
              )}
            </div>
          </div>

          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid var(--paper-border)',
              backgroundColor: 'var(--paper-subtle)',
              fontSize: '0.75rem',
              color: 'var(--ink-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Field records</span>
            <span>{sources.length} sources</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: 'absolute',
        left: '10px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--ink-tertiary)',
      }}
    >
      <circle cx="11" cy="11" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
