import React from 'react';
import { SpendDeskLogo } from './SpendDeskLogo';

const WORDMARK = 'Spend Desk'.split('');

/**
 * The branded splash — the first thing the app shows while it warms up, and
 * what every refresh replays (mounted from App on every load).
 *
 * LIGHT THEME: a clean off-white canvas with a breathing mint aura, two soft
 * pulse rings expanding away from a floating white logo tile, the wordmark
 * arriving letter by letter, the tagline drawing its own tracking in, and a
 * single shimmer line at the foot. Everything is transform/opacity (plus one
 * letter-spacing reveal) and every piece parks in its final state under
 * prefers-reduced-motion.
 *
 * Purely presentational — gone again in under two seconds.
 */
export const SplashScreen: React.FC = () => (
  <div
    className="fixed inset-0 z-[95] flex flex-col items-center justify-center overflow-hidden bg-[#f0f4f5] animate-in fade-in duration-300"
    aria-hidden="true"
  >
    {/* Layered aurora: one breathing core glow, two corner tints */}
    <div className="sd-splash-breathe pointer-events-none absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(16,183,127,0.20),rgba(16,183,127,0)_65%)]" />
    <div className="pointer-events-none absolute -bottom-28 -left-32 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(43,217,141,0.16),rgba(43,217,141,0)_65%)]" />
    <div className="pointer-events-none absolute -right-28 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.18),rgba(45,212,191,0)_65%)]" />

    {/* Pulse rings rising away from the logo tile */}
    <div className="relative flex h-32 w-32 items-center justify-center">
      <span className="sd-ping-ring pointer-events-none absolute inset-0 rounded-full border border-[#10b77f]/45" />
      <span
        className="sd-ping-ring pointer-events-none absolute inset-0 rounded-full border border-[#10b77f]/30"
        style={{ animationDelay: '650ms' }}
      />

      <div className="sd-logo-pop relative flex h-24 w-24 items-center justify-center rounded-[26px] bg-white border border-emerald-100 shadow-[0_22px_50px_-20px_rgba(16,183,127,0.55)]">
        <SpendDeskLogo variant="icon" size="xl" className="h-20 w-20" />
      </div>
    </div>

    {/* Wordmark, letter by letter */}
    <p className="mt-7 flex text-[27px] font-black leading-none tracking-[-0.02em] text-slate-900">
      {WORDMARK.map((ch, i) => (
        <span
          key={i}
          className="sd-letter"
          style={{ animationDelay: `${260 + i * 45}ms` }}
        >
          {ch === ' ' ? <span className="w-[0.22em]" aria-hidden="true" /> : ch}
        </span>
      ))}
    </p>

    {/* Tagline: tracking draws in */}
    <p className="sd-tagline mt-3 text-[10px] font-bold tracking-[0.5em] text-[#10b77f]/80">
      CASH &amp; CARD
    </p>

    {/* Shimmer loading line */}
    <div className="absolute bottom-14 h-[3px] w-28 overflow-hidden rounded-full bg-slate-200">
      <div className="sd-splash-line h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-[#10b77f] to-transparent" />
    </div>
  </div>
);

export default SplashScreen;
