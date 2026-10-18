'use client';

import React, { useState } from 'react';
import { Workspace, AgentReply } from '@/lib/types';
import {
  Send,
  Sparkles,
  ShieldCheck,
  FileText,
  AlertCircle,
} from 'lucide-react';

interface StudioMemoryProps {
  workspace: Workspace | null;
  replies: AgentReply[];
  onSendMessage: (message: string) => Promise<void>;
  onOpenSourceDrawer: (sourceId?: string) => void;
  isSending: boolean;
  isLiveAiEnabled: boolean;
  isLiveCapable: boolean;
}

export function StudioMemoryView({ workspace, replies, onSendMessage, onOpenSourceDrawer, isSending, isLiveAiEnabled, isLiveCapable }: StudioMemoryProps) {
  const [inputMessage, setInputMessage] = useState('');

  if (!workspace) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isSending) return;
    const msg = inputMessage.trim();
    setInputMessage('');
    await onSendMessage(msg);
  };

  const handleQuickPrompt = async (promptText: string) => {
    if (isSending) return;
    await onSendMessage(promptText);
  };

  const quickPrompts = [
    'What needs attention before the truck rolls?',
    'Which work orders are blocked?',
    'What is the valid repair for W-114?',
    'Summarize the open findings.',
  ];

  const isLiveActive = isLiveAiEnabled && isLiveCapable;

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '1.5rem', paddingBottom: '4rem' }} data-testid="memory-view" data-view="memory">
      <div className="editorial-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <svg width="38" height="38" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="#C22A08" strokeWidth="3" />
            <path d="M30 50 Q50 15 70 50" fill="none" stroke="#C22A08" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div>
            <span className="editorial-section-number">01</span>
            <span className="editorial-label">Ask FieldProof</span>
            <h2 className="editorial-headline" style={{ fontSize: '2.2rem', marginTop: '2px' }}>
              Ask about your field plan
            </h2>
          </div>
        </div>
        <span
          className={`badge-status ${isLiveActive ? 'live' : 'deterministic'}`}
          style={{ fontSize: '0.75rem' }}
        >
          {isLiveActive ? <Sparkles size={12} /> : <ShieldCheck size={12} />}
          {isLiveActive ? 'AI-assisted answer' : 'Rules-based answer'}
        </span>
      </div>

      <p style={{ fontSize: '0.92rem', color: 'var(--ink-secondary)', maxWidth: '780px', marginTop: '-12px' }}>
        Ask in plain language. Answers are grounded in your field-service records, and FieldProof says when it is unsure.
      </p>

      <div className="paper-card" style={{ padding: '24px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label htmlFor="memory-query-input" className="editorial-label">
            Your question
          </label>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              id="memory-query-input"
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="e.g. What still needs attention before we dispatch?"
              className="editorial-input"
              disabled={isSending}
              style={{ flex: 1, fontSize: '0.92rem' }}
            />
            <button
              type="submit"
              disabled={isSending || !inputMessage.trim()}
              className="btn-editorial-primary"
              style={{ padding: '0 20px' }}
            >
              {isSending ? (
                'Recalling…'
              ) : (
                <>
                  <Send size={14} />
                  Ask
                </>
              )}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Try one of these:
            </span>
            {quickPrompts.map((prompt, pIdx) => (
              <button
                key={pIdx}
                type="button"
                onClick={() => handleQuickPrompt(prompt)}
                disabled={isSending}
                className="btn-editorial-secondary"
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  textAlign: 'left',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </form>
      </div>

      {replies.length > 0 && (
        <section>
          <div className="editorial-section-header">
            <div>
              <span className="editorial-section-number">02</span>
              <span className="editorial-label">Answers</span>
              <h3 className="editorial-headline" style={{ fontSize: '1.25rem', marginTop: '2px' }}>
                Recorded answers ({replies.length})
              </h3>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {replies.map((reply, rIdx) => {
              const isDeterministic = reply.mode === 'deterministic';

              return (
                <div
                  key={rIdx}
                  className="paper-card"
                  style={{
                    padding: '22px',
                    borderLeft: isDeterministic ? '4px solid var(--paper-border-strong)' : '4px solid var(--clay-600)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      className={`badge-status ${isDeterministic ? 'deterministic' : 'live'}`}
                      style={{ fontSize: '0.72rem' }}
                    >
                      {isDeterministic ? <ShieldCheck size={12} /> : <Sparkles size={12} />}
                      {isDeterministic ? 'Rules-based answer' : 'AI-assisted answer'}
                    </span>
                  </div>

                  {reply.warning && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--orange-light)',
                        border: '1px solid var(--orange-border)',
                        borderRadius: 'var(--radius-xs)',
                        fontSize: '0.78rem',
                        color: 'var(--orange-text)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <AlertCircle size={13} />
                      {reply.warning}
                    </div>
                  )}

                  <p
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '0.98rem',
                      lineHeight: '1.6',
                      color: 'var(--ink-primary)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {reply.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
