/**
 * Professional Haptic & Audio Feedback Engine for Web / PWA
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export type FeedbackType = 'tap' | 'toggle' | 'success' | 'warning' | 'error';

export function triggerFeedback(type: FeedbackType = 'tap') {
  // 1. Mobile Physical Vibration
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'tap') navigator.vibrate(8);
      else if (type === 'toggle') navigator.vibrate(12);
      else if (type === 'success') navigator.vibrate([10, 30, 20]);
      else if (type === 'warning') navigator.vibrate([20, 40, 20]);
      else if (type === 'error') navigator.vibrate([30, 50, 40]);
    } catch {
      // Ignore vibration errors
    }
  }

  // 2. Subtle Web Audio synthesis (ultra-quiet, high-end micro-interaction)
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'tap') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      osc.start(now);
      osc.stop(now + 0.03);
    } else if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.04); // E5
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    }
  } catch {
    // Audio synthesis failure is non-critical
  }
}
