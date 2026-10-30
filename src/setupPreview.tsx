/**
 * DEV-ONLY preview harness (opened at /setup-preview.html by the dev server).
 *
 * It mounts the REAL SheetSetupModal and drives its phases so the three-step
 * Google Sheet onboarding can be inspected without a live Google sign-in:
 *
 *   Get Started            → step 2 (Connect)
 *   Create Google Sheet    → 'creating' for 1.4s, then 'success' (or 'error'
 *                            when "simulate a failure" is ticked)
 *   Go to Dashboard        → modal closes
 *
 * Nothing here is imported by the app itself, and Vite only serves it in dev.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { SheetSetupModal, SheetSetupPhase } from './components/SheetSetupModal';
import { ConfirmModal } from './components/ConfirmModal';
import { DailyCarryForwardModal } from './components/DailyCarryForwardModal';
import { OutOfWalletModal } from './components/OutOfWalletModal';
import SplashScreen from './components/SplashScreen';
import { CarryForwardOffer } from './lib/dailyCarryForward';

const Harness: React.FC = () => {
  const [phase, setPhase] = useState<SheetSetupPhase | null>('needed');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [failNext, setFailNext] = useState(false);
  const [dialog, setDialog] = useState<'none' | 'delete' | 'carry' | 'oow' | 'splash'>('none');

  const carryOffer: CarryForwardOffer = {
    amount: 450,
    fromDay: '2026-10-25',
    fromLabel: '25 Oct',
  };

  // The modal derives its visible step from phase transitions, so to show a
  // mid/late state on demand we close it (phase null) first and reopen into
  // the target phase on the next tick.
  const jumpTo = (target: SheetSetupPhase) => {
    setPhase(null);
    window.setTimeout(() => setPhase(target), 30);
  };

  const create = () => {
    setErrorMessage(undefined);
    setPhase('creating');
    // Long enough that the loading state can actually be screenshotted.
    window.setTimeout(() => {
      if (failNext) {
        setErrorMessage('Google could not create the sheet right now. Check your connection and try again.');
        setPhase('error');
      } else {
        setPhase('success');
      }
    }, 6000);
  };

  return (
    <div style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: '#1b1c1e', margin: '0 0 4px' }}>
          Google Sheet setup — onboarding preview
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          The real <code>SheetSetupModal</code> component, driven through its four phases.
        </p>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#334155', marginBottom: 16 }}>
          <input type="checkbox" checked={failNext} onChange={(e) => setFailNext(e.target.checked)} />
          Simulate a creation failure (shows the error + Try Again state)
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => { setErrorMessage(undefined); setPhase('needed'); }}
            style={btn}
          >
            Open onboarding
          </button>
          <button onClick={() => jumpTo('creating')} style={btn}>
            Loading state
          </button>
          <button onClick={() => { setErrorMessage('Google blocked this request. Allow access and try again.'); jumpTo('error'); }} style={btn}>
            Error state
          </button>
          <button onClick={() => jumpTo('success')} style={btn}>
            Success state
          </button>
          <button onClick={() => setPhase(null)} style={{ ...btn, background: '#e2e8f0', color: '#334155' }}>
            Close
          </button>
          <button onClick={() => setDialog('delete')} style={{ ...btn, background: '#e11d48' }}>
            Delete popup
          </button>
          <button onClick={() => setDialog('carry')} style={{ ...btn, background: '#059669' }}>
            Yesterday balance popup
          </button>
          <button onClick={() => setDialog('oow')} style={{ ...btn, background: '#b45309' }}>
            Out of wallet popup
          </button>
          <button onClick={() => setDialog('splash')} style={{ ...btn, background: '#0f766e' }}>
            Splash screen
          </button>
        </div>
      </div>

      <SheetSetupModal
        phase={phase}
        errorMessage={errorMessage}
        onCreate={create}
        onDismiss={() => setPhase(null)}
        onContinue={() => setPhase(null)}
      />

      <ConfirmModal
        isOpen={dialog === 'delete'}
        title="Delete Transaction"
        message="Delete this Food transaction of Rs 500? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={() => setDialog('none')}
        onCancel={() => setDialog('none')}
      />

      <DailyCarryForwardModal
        offer={dialog === 'carry' ? carryOffer : null}
        currency="Rs"
        onConfirm={() => setDialog('none')}
        onDismiss={() => setDialog('none')}
      />

      {dialog === 'splash' && (
        <div onDoubleClick={() => setDialog('none')} title="Double-click to close">
          <SplashScreen />
        </div>
      )}

      <OutOfWalletModal
        isOpen={dialog === 'oow'}
        amount={1000}
        date="2026-10-26"
        currency="Rs"
        onDismiss={() => setDialog('none')}
        onSaveBorrowed={() => setDialog('none')}
      />
    </div>
  );
};

const btn: React.CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: '#116b4e',
  cursor: 'pointer',
};

createRoot(document.getElementById('root')!).render(<Harness />);
