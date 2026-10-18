'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';

/**
 * Custom hook to trap focus and handle keyboard Escape closing.
 * Returns the container ref and automatically restores focus on unmount.
 */
function useModalFocusTrap(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    }, 20);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && containerRef.current) {
        const focusables = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(
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
      document.body.style.overflow = previousOverflow;
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  return containerRef;
}

interface ResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ResetModal({ isOpen, onClose, onConfirm }: ResetModalProps) {
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const containerRef = useModalFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setResetError('');
    try {
      await onConfirm();
      onClose();
    } catch {
      setResetError('Could not start over. Your current workspace is still here. Try again.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '50%',
              backgroundColor: 'var(--clay-100)',
              color: 'var(--clay-700)',
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <span className="editorial-label" style={{ color: 'var(--clay-700)' }}>
              Start over
            </span>
            <h3 id="reset-modal-title" className="editorial-headline" style={{ fontSize: '1.25rem', marginTop: '2px' }}>
              Start over?
            </h3>
          </div>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--ink-secondary)', lineHeight: '1.5', marginBottom: '20px' }}>
          Return to field desk setup to load a fresh fixture. This starts a separate workspace; your current plan
          and edits won't be carried over. Cancel to keep working on this plan.
        </p>

        {resetError && <p role="alert" style={{ marginBottom: 16, color: '#9a2818' }}>{resetError}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-editorial-secondary"
            disabled={isResetting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-editorial-primary"
            disabled={isResetting}
          >
            {isResetting ? 'Resetting schedule…' : 'Start over'}
          </button>
        </div>
      </div>
    </div>
  );
}
