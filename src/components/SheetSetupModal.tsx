import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, Loader2, ShieldCheck } from 'lucide-react';
import googleSheetsLogoPng from '../assets/images/google_sheets_logo.png';
import googleDriveLogoPng from '../assets/images/google_drive_logo.png';

export type SheetSetupPhase = 'needed' | 'creating' | 'success' | 'error';

type SetupStep = 'welcome' | 'connect' | 'done';

interface SheetSetupModalProps {
  /** null = nothing to show. */
  phase: SheetSetupPhase | null;
  errorMessage?: string;
  /** Start creating the sheet (guarded by `phase === 'creating'`). */
  onCreate: () => void;
  /** Leave the onboarding without completing — ✕ / back / backdrop rules. */
  onDismiss: () => void;
  /** Success screen → "Go to Dashboard". */
  onContinue: () => void;
}

/**
 * Official Google Sheets mark — the real gstatic brand asset, bundled into the
 * build so setup never depends on the network, and unmistakably the logo the
 * user recognises from Drive.
 */
const SheetsGlyph: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <img
    src={googleSheetsLogoPng}
    alt=""
    aria-hidden="true"
    draggable={false}
    className="select-none object-contain"
    style={{ width: size, height: size }}
  />
);

const Cloud: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 64 28" className={className} aria-hidden="true" fill="currentColor">
    <path d="M16 26h33c6.6 0 12-4.5 12-10.5S55.6 5 49 5c-1.4 0-2.7.2-3.9.6C42.7 2.6 38.7 0 34 0c-6.1 0-11.2 4.4-12.3 10.2-.9-.3-1.9-.4-2.9-.4C11.5 9.8 7 13.7 7 18.5S11.5 26 16 26Z" />
  </svg>
);

/** Official Google Drive mark — same bundled gstatic brand asset rule. */
const DriveGlyph: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <img
    src={googleDriveLogoPng}
    alt=""
    aria-hidden="true"
    draggable={false}
    className="select-none object-contain"
    style={{ width: size, height: size }}
  />
);

/* ── Step illustrations ──────────────────────────────────────────────────── */

/**
 * The welcome illustration from the design: a document card with checklist
 * rows, a mint blob behind it, a small green chart badge on the left and a
 * green shield-check on the right, over soft clouds.
 */
const WelcomeArt: React.FC = () => (
  <div className="relative flex h-44 w-full items-center justify-center">
    {/* soft clouds */}
    <Cloud className="absolute left-6 top-8 h-5 w-12 text-emerald-100" />
    <Cloud className="absolute right-7 top-14 h-4 w-10 text-teal-100" />

    {/* mint blob behind the document */}
    <div className="absolute h-36 w-36 rounded-full bg-gradient-to-br from-emerald-100 to-teal-50" />

    {/* the document being set up, checklist rows settling in */}
    <div className="sd-sheet-in relative h-32 w-44 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_18px_38px_-22px_rgba(15,23,42,0.4)]">
      <div className="mb-3 h-2 w-20 rounded-full bg-slate-200" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="mb-2 flex items-center gap-1.5">
          <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-emerald-500">
            <svg className="h-[7px] w-[7px] text-white" viewBox="0 0 14 14" fill="none">
              <path d="M3 7.2 5.6 10 11 4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="h-1.5 rounded-full bg-slate-100" style={{ width: `${86 - i * 14}%` }} />
        </div>
      ))}
    </div>

    {/* chart badge — left */}
    <span
      className="sd-confetti-pop absolute left-[16%] top-[38%] flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 shadow-[0_10px_22px_-8px_rgba(5,150,105,0.6)]"
      style={{ animationDelay: '160ms' }}
      aria-hidden="true"
    >
      <BarChart3 className="h-4 w-4 text-white" />
    </span>

    {/* shield badge — right */}
    <span
      className="sd-confetti-pop absolute right-[14%] top-[24%] flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 shadow-[0_10px_22px_-8px_rgba(5,150,105,0.6)]"
      style={{ animationDelay: '260ms' }}
      aria-hidden="true"
    >
      <ShieldCheck className="h-5 w-5 text-white" />
    </span>
  </div>
);

const ConnectArt: React.FC = () => (
  <div className="flex h-44 w-full items-center justify-center gap-4">
    {/* the document we will create */}
    <div className="relative h-28 w-24 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 h-2 w-12 rounded-full bg-slate-200" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="mb-1.5 h-1.5 rounded-full bg-slate-100" style={{ width: `${90 - i * 12}%` }} />
      ))}
      <div className="absolute -bottom-2 -right-2">
        <SheetsGlyph size={22} />
      </div>
    </div>
    <svg width="34" height="16" viewBox="0 0 34 16" fill="none" aria-hidden="true">
      <path d="M0 8h27" stroke="#0F9D58" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M23 3l6 5-6 5" stroke="#0F9D58" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div className="flex h-28 w-24 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <DriveGlyph size={54} />
    </div>
  </div>
);

/**
 * The party burst on the "All set" step: confetti flying outward from the
 * check mark, the way a payment-success screen celebrates. Each piece carries
 * its own vector, spin and delay through CSS custom properties, so the whole
 * thing is one keyframe animation (transform + opacity) instead of a layout
 * animation per piece.
 */
const CONFETTI_BURST: { x: number; y: number; rot: number; cls: string; delay: number }[] = [
  { x: -104, y: -64, rot: -220, cls: 'h-4 w-2.5 rounded-[2px] bg-sky-400', delay: 0 },
  { x: -64, y: -80, rot: 180, cls: 'h-2.5 w-2.5 rounded-full bg-amber-400', delay: 40 },
  { x: -22, y: -80, rot: -160, cls: 'h-3.5 w-2 rounded-[2px] bg-rose-400', delay: 80 },
  { x: 26, y: -78, rot: 200, cls: 'h-2.5 w-2.5 rounded-full bg-emerald-400', delay: 60 },
  { x: 66, y: -74, rot: -190, cls: 'h-4 w-2 rounded-[2px] bg-violet-400', delay: 100 },
  { x: 104, y: -58, rot: 230, cls: 'h-2.5 w-2.5 rounded-full bg-sky-500', delay: 120 },
  { x: -124, y: -18, rot: -250, cls: 'h-3.5 w-2 rounded-[2px] bg-amber-500', delay: 140 },
  { x: 124, y: -14, rot: 250, cls: 'h-2.5 w-2.5 rounded-full bg-rose-500', delay: 160 },
  { x: -116, y: 34, rot: -280, cls: 'h-4 w-2 rounded-[2px] bg-teal-400', delay: 180 },
  { x: 118, y: 38, rot: 300, cls: 'h-3.5 w-2 rounded-[2px] bg-indigo-400', delay: 200 },
  { x: -76, y: 70, rot: -320, cls: 'h-2.5 w-2.5 rounded-full bg-emerald-500', delay: 220 },
  { x: 80, y: 74, rot: 330, cls: 'h-4 w-2 rounded-[2px] bg-amber-400', delay: 240 },
  { x: -36, y: 80, rot: -340, cls: 'h-3 w-2 rounded-[2px] bg-sky-400', delay: 260 },
  { x: 40, y: 80, rot: 350, cls: 'h-2.5 w-2.5 rounded-full bg-violet-500', delay: 280 },
];

const DoneArt: React.FC = () => (
  <div className="relative flex h-44 w-full items-center justify-center">
    {/* Expanding ring as the check lands */}
    <span
      className="sd-check-ring pointer-events-none absolute h-32 w-32 rounded-full border-2 border-emerald-400/70"
      aria-hidden="true"
    />
    {/* Confetti bursting out from behind the badge */}
    {CONFETTI_BURST.map((piece, i) => (
      <span
        key={i}
        className={`sd-burst pointer-events-none absolute left-1/2 top-1/2 -ml-[5px] -mt-[5px] ${piece.cls}`}
        style={{
          '--sd-bx': `${piece.x}px`,
          '--sd-by': `${piece.y}px`,
          '--sd-brot': `${piece.rot}deg`,
          animationDelay: `${piece.delay}ms`,
        } as React.CSSProperties}
        aria-hidden="true"
      />
    ))}
    <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-emerald-500 shadow-[0_16px_36px_-12px_rgba(5,150,105,0.6)]">
      <svg width="54" height="54" viewBox="0 0 54 54" fill="none" aria-hidden="true">
        <path
          d="M15 27.5 23.5 36 39 19"
          stroke="#fff"
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="sd-check-draw"
        />
      </svg>
    </div>
  </div>
);

/**
 * One step row from the design: a bordered white card with a solid green
 * numbered circle and one short sentence. The welcome step numbers its rows
 * (1·2·3); the other steps keep their icon (sheet / check).
 */
const StepRow: React.FC<{
  icon: 'check' | 'sheet';
  number?: number;
  children: React.ReactNode;
}> = ({ icon, number, children }) => (
  <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    {number !== undefined ? (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-black text-white shadow-[0_6px_14px_-6px_rgba(5,150,105,0.7)]">
        {number}
      </span>
    ) : icon === 'sheet' ? (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-emerald-100 shadow-sm">
        <SheetsGlyph size={13} />
      </span>
    ) : (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-[0_6px_14px_-6px_rgba(5,150,105,0.7)]">
        <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 7.2 5.6 10 11 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )}
    <span className="text-[13px] font-medium leading-snug text-slate-600">{children}</span>
  </li>
);

const CHECKLISTS: Record<SetupStep, { icon: 'check' | 'sheet'; text: string }[]> = {
  welcome: [
    { icon: 'check', text: 'Your data will be stored securely' },
    { icon: 'check', text: 'Access from any device' },
    { icon: 'check', text: 'Keep your financial data safe' },
  ],
  connect: [
    { icon: 'sheet', text: 'Create a new Google Sheet' },
    { icon: 'sheet', text: 'Set up required columns' },
    { icon: 'sheet', text: 'Connect securely to your account' },
  ],
  done: [
    { icon: 'check', text: 'Google Sheet created' },
    { icon: 'check', text: 'Account connected' },
    { icon: 'check', text: 'Ready to use' },
  ],
};

const TITLES: Record<SetupStep, string> = {
  welcome: "Let's Set Up Your Account",
  connect: 'Create & Connect Google Sheet',
  done: "You're All Set!",
};

const SUBTITLES: Record<SetupStep, string> = {
  welcome: 'Follow these simple steps to securely manage your finances.',
  connect: "We'll create a Google Sheet for you and connect it to your account.",
  done: 'Your Google Sheet is connected. You can now manage your transactions.',
};

/**
 * Google Sheet setup — a guided three-step onboarding presented as a centered
 * white modal over a light backdrop, exactly per the approved design:
 *
 *   1. Welcome  — "Let's Set Up Your Account"  → Get Started
 *   2. Connect  — "Create & Connect Google Sheet" → Create Google Sheet
 *   3. Complete — "You're All Set!" → Go to Dashboard
 *
 * Top bar carries a back circle, a progress track with "N of 3" and a close
 * ✕; each step shows its illustration, copy and a three-row checklist (the
 * welcome rows are numbered 1·2·3), with one full-width gradient CTA at the
 * bottom.
 *
 * Deliberately mandatory: transaction actions are blocked until this finishes
 * (see handleSaveTransaction), repeated taps cannot double-create a sheet
 * (the button is disabled from the first press), and the success screen only
 * appears once the sheet is genuinely connected. Failure keeps step 2 open
 * with a human sentence plus Try Again — raw Google API text never reaches
 * this surface (see friendlySheetErrorMessage).
 */
export const SheetSetupModal: React.FC<SheetSetupModalProps> = ({
  phase,
  errorMessage,
  onCreate,
  onDismiss,
  onContinue,
}) => {
  const [step, setStep] = useState<SetupStep>('welcome');
  const wasOpenRef = useRef(false);

  // Every fresh open starts at step 1; the success phase jumps straight to
  // the final screen (creation finishes while we are on step 2).
  useEffect(() => {
    if (!phase) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (phase === 'success') setStep('done');
    else if (justOpened) setStep('welcome');
  }, [phase]);

  // While setup owns the screen, the page behind must not scroll.
  useEffect(() => {
    if (!phase) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [phase]);

  if (!phase) return null;

  const isBusy = phase === 'creating';
  const stepNo = step === 'welcome' ? 1 : step === 'connect' ? 2 : 3;
  const goBack = () => {
    if (isBusy) return;
    if (step === 'connect') setStep('welcome');
    else onDismiss();
  };

  const ctaClass =
    'w-full h-12 rounded-2xl text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-[0.985] disabled:opacity-70 disabled:pointer-events-none';

  return (
    <div className="fixed inset-0 z-[72] overflow-y-auto overscroll-none bg-[#f0f4f5]/95 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        {/* The modal card */}
        <div className="relative w-full max-w-[440px] rounded-[26px] bg-white px-6 pb-7 pt-5 shadow-[0_32px_70px_-20px_rgba(15,23,42,0.35)] animate-in zoom-in-95 fade-in duration-200">
          {/* Top bar: back · progress · close */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={isBusy}
              aria-label="Back"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div className="flex flex-col items-center gap-1.5">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
                  style={{ width: `${(stepNo / 3) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-400 tabular-nums">{stepNo} of 3</span>
            </div>

            <button
              type="button"
              onClick={onDismiss}
              disabled={isBusy}
              aria-label="Close setup"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-col items-center justify-center pb-2 pt-4 text-center">
            {step === 'welcome' && <WelcomeArt />}
            {step === 'connect' && <ConnectArt />}
            {step === 'done' && <DoneArt />}

            <p
              id="sheet-setup-title"
              className="mt-2 text-[20px] font-extrabold tracking-[-0.02em] text-slate-900"
            >
              {TITLES[step]}
            </p>
            <p
              id="sheet-setup-message"
              className="mt-2 max-w-[310px] text-[13px] leading-relaxed text-slate-500"
            >
              {SUBTITLES[step]}
            </p>

            {step === 'connect' && phase === 'error' && (
              <div className="mt-4 max-w-[310px] rounded-2xl border border-rose-100 bg-rose-50 px-3.5 py-2.5">
                <p className="text-[12px] leading-snug text-rose-600">
                  {errorMessage || 'Could not create a Google Sheet. You can try again.'}
                </p>
              </div>
            )}

            <ul className="mt-6 w-full max-w-[330px] space-y-2.5 text-left">
              {CHECKLISTS[step].map((item, i) => (
                <StepRow key={item.text} icon={item.icon} number={step === 'welcome' ? i + 1 : undefined}>
                  {item.text}
                </StepRow>
              ))}
            </ul>
          </div>

          {/* Primary CTA */}
          <div>
            {step === 'welcome' && (
              <button
                type="button"
                onClick={() => setStep('connect')}
                className={`${ctaClass} bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-[0_12px_26px_-14px_rgba(5,150,105,0.9)]`}
              >
                Get Started
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2.5 8h10M9.5 4.5 13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            {step === 'connect' && (
              <button
                type="button"
                onClick={onCreate}
                disabled={isBusy}
                className={`${ctaClass} bg-slate-900 hover:bg-slate-800`}
              >
                {isBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating your sheet…
                  </>
                ) : phase === 'error' ? (
                  'Try Again'
                ) : (
                  'Create Google Sheet'
                )}
              </button>
            )}

            {step === 'done' && (
              <button
                type="button"
                onClick={onContinue}
                className={`${ctaClass} bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-[0_12px_26px_-14px_rgba(5,150,105,0.9)]`}
              >
                Go to Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
