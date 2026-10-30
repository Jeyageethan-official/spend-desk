/**
 * Interaction feedback engine.
 *
 * Haptics where the platform allows it, and OPTIONAL sound — off by default,
 * opt-in from Settings → Sound feedback. Nothing here ever plays on its own:
 * `triggerFeedback` is called throughout the UI, and the flag decides whether
 * a tap actually produces audio.
 *
 * THE SOUND: system-level UI audio in the Apple tradition — nothing is a raw
 * beep. Every sound is synthesized from layered sine partials through one
 * shared compressor bus, so overlapping taps never clip and the whole set
 * sits at a quiet, warm, "hardware" level:
 *
 *   tap     — a wooden "tock": soft 180 Hz body thump + a 1.9 kHz cloth tick
 *   toggle  — a two-note upward blip (closed → open)
 *   success — a major arpeggio (C6 → E6 → G6) with a bell partial shimmer
 *   warning — a mellow two-note falling pair, low and rounded
 *   error   — a soft minor third drop (E5 → C5), firm but never harsh
 *
 * Voices use exponential-ish decay envelopes with a 3 ms attack (no clicks),
 * and the master bus runs through a DynamicsCompressor + gentle lowpass so
 * the result stays smooth at any volume.
 */

export type FeedbackType = 'tap' | 'toggle' | 'success' | 'warning' | 'error';

const SOUND_KEY = 'spenddesk_sound_feedback';

let soundEnabled = (() => {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
})();

export function isSoundFeedbackEnabled(): boolean {
  return soundEnabled;
}

export function setSoundFeedbackEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  try {
    localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
  } catch {
    /* private mode — the flag simply lives for this session */
  }
}

let audioCtx: AudioContext | null = null;
let masterBus: GainNode | null = null;

const ATTACK_SEC = 0.003;

/** Lazily build the shared graph: voices → compressor → soft lowpass → out. */
const ensureGraph = (): AudioContext | null => {
  try {
    if (audioCtx && masterBus) return audioCtx;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.18;

    const tone = audioCtx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 9000; // takes the digital edge off every voice

    masterBus = audioCtx.createGain();
    masterBus.gain.value = 0.9;

    compressor.connect(tone);
    tone.connect(masterBus);
    masterBus.connect(audioCtx.destination);
    return audioCtx;
  } catch {
    return null;
  }
};

const now = (ctx: AudioContext) => {
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx.currentTime;
};

interface VoiceOptions {
  /** Fundamental frequency in Hz. */
  freq: number;
  /** Note length in seconds. */
  duration: number;
  /** Seconds after "now" before this voice starts. */
  delay?: number;
  /** Peak amplitude of the fundamental (before the master bus). */
  gain?: number;
  /** Waveform of the fundamental. */
  type?: OscillatorType;
  /** Amplitude of the octave partial (adds bell/marimba body). */
  partial?: number;
  /** Hz per second of downward glide — gives the note a natural "settling". */
  glide?: number;
}

/**
 * One synthesized note: fundamental + optional octave partial, each with a
 * short attack and an exponential release. Connecting through the shared
 * compressor bus is what keeps the whole set from ever sounding harsh.
 */
const voice = ({
  freq,
  duration,
  delay = 0,
  gain = 0.05,
  type = 'sine',
  partial = 0,
  glide = 0,
}: VoiceOptions) => {
  const ctx = ensureGraph();
  if (!ctx || !masterBus) return;
  const start = now(ctx) + delay;
  const end = start + duration;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glide > 0) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq - glide * duration), end);
  }

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + ATTACK_SEC);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(amp);
  amp.connect(masterBus);
  osc.start(start);
  osc.stop(end + 0.03);

  if (partial > 0) {
    const oct = ctx.createOscillator();
    oct.type = 'sine';
    oct.frequency.setValueAtTime(freq * 2, start);
    const octAmp = ctx.createGain();
    // The octave partial decays faster — that decay ratio is what reads as
    // "bell" instead of "beep".
    octAmp.gain.setValueAtTime(0.0001, start);
    octAmp.gain.linearRampToValueAtTime(gain * partial, start + ATTACK_SEC);
    octAmp.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.55);
    oct.connect(octAmp);
    octAmp.connect(masterBus);
    oct.start(start);
    oct.stop(start + duration * 0.6);
  }
};

/** A tiny band-limited noise burst — the "cloth/mallet" transient on top. */
const tick = (delay = 0, gain = 0.02, freq = 1900) => {
  const ctx = ensureGraph();
  if (!ctx || !masterBus) return;
  const start = now(ctx) + delay;

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.45, start + 0.03);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.035);

  osc.connect(amp);
  amp.connect(masterBus);
  osc.start(start);
  osc.stop(start + 0.05);
};

const SOUND_SET: Record<FeedbackType, () => void> = {
  // Soft wooden "tock" — a body thump plus a high transient. Reads as a
  // physical tap, not a beep; safe to hear hundreds of times a day.
  tap: () => {
    voice({ freq: 180, duration: 0.045, gain: 0.045, glide: 60 });
    tick(0, 0.016, 1900);
  },
  // Two-note upward blip: the state "closed → open" in miniature.
  toggle: () => {
    voice({ freq: 523.25, duration: 0.06, gain: 0.04 }); // C5
    voice({ freq: 783.99, duration: 0.08, gain: 0.04, delay: 0.055 }); // G5
  },
  // Major arpeggio with bell shimmer — the save/achievement voice.
  success: () => {
    voice({ freq: 1046.5, duration: 0.18, gain: 0.05 }); // C6
    voice({ freq: 1318.51, duration: 0.2, gain: 0.05, delay: 0.085 }); // E6
    voice({ freq: 1567.98, duration: 0.38, gain: 0.055, delay: 0.17, partial: 0.35 }); // G6
  },
  // Mellow falling pair — noticeable, never alarming.
  warning: () => {
    voice({ freq: 493.88, duration: 0.14, gain: 0.05, partial: 0.15 }); // B4
    voice({ freq: 392.0, duration: 0.22, gain: 0.05, delay: 0.11, partial: 0.15 }); // G4
  },
  // Soft minor-third drop — firm, final, and still pleasant.
  error: () => {
    voice({ freq: 659.25, duration: 0.12, gain: 0.05 }); // E5
    voice({ freq: 523.25, duration: 0.26, gain: 0.05, delay: 0.09, partial: 0.2 }); // C5
  },
};

/** Shortest gap between two sounds of the same kind (rapid taps coalesce). */
const MIN_GAP_MS = 45;
const lastPlayedAt: Record<string, number> = {};

export function triggerFeedback(type: FeedbackType = 'tap') {
  // Light haptic where the device supports it (silent on desktop).
  try {
    if (type === 'success' && navigator.vibrate) navigator.vibrate(12);
    else if (type === 'warning' || type === 'error') navigator.vibrate?.([14, 40, 14]);
  } catch {
    /* ignore */
  }

  if (!soundEnabled) return;

  try {
    const t = Date.now();
    if (t - (lastPlayedAt[type] || 0) < MIN_GAP_MS) return;
    lastPlayedAt[type] = t;
    SOUND_SET[type]();
  } catch {
    /* audio unavailable — feedback is a nicety, never a blocker */
  }
}
