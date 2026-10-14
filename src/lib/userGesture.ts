/**
 * User-activation tracker for Google sign-in UI.
 *
 * Google's sign-in / account-chooser screens must ONLY ever appear because a
 * human just tapped something in SpendDesk - never because a background timer,
 * token-renewal watchdog, sheet sync or boot-time restore decided it needed a
 * fresh token.
 *
 * We deliberately do NOT trust `navigator.userActivation.isActive`: it is
 * transient activation and it is granted by page navigation/focus, so on a
 * freshly loaded tab it reports `true` before anyone has touched the page -
 * which would let a background caller through the gate. The only accepted
 * evidence is an input event we recorded ourselves, captured at the window
 * capture phase so it always lands before the React click handler that follows.
 *
 * Fail-closed by design: with no recorded input the answer is "blocked".
 * Every real interaction path (pointer, mouse, touch, key, and a synthesized
 * `click` from assistive tech) stamps the tracker, so a genuine button press
 * always opens the gate while timers and fetch callbacks never do.
 */

const USER_GESTURE_WINDOW_MS = 30000;

let lastUserGestureAt = 0;
let trackerInstalled = false;

const installTracker = () => {
  if (typeof window === 'undefined' || trackerInstalled) return;
  trackerInstalled = true;
  const stamp = () => {
    lastUserGestureAt = Date.now();
  };
  // capture + passive so we record the gesture before anything cancels it.
  (window as any).addEventListener('pointerdown', stamp, { capture: true, passive: true });
  (window as any).addEventListener('mousedown', stamp, { capture: true, passive: true });
  (window as any).addEventListener('touchstart', stamp, { capture: true, passive: true });
  (window as any).addEventListener('keydown', stamp, { capture: true, passive: true });
  (window as any).addEventListener('click', stamp, { capture: true, passive: true });
};

installTracker();

/**
 * True only when a real human interaction was recorded moments ago, i.e. it is
 * safe to hand control over to Google's sign-in flow.
 */
export const hasFreshUserGesture = (windowMs: number = USER_GESTURE_WINDOW_MS): boolean => {
  if (lastUserGestureAt === 0) return false;
  return Date.now() - lastUserGestureAt <= windowMs;
};

/** Introspection for tests: epoch ms of the last recorded input, 0 if none. */
export const getLastUserGestureAt = (): number => lastUserGestureAt;

/** Error shown when Google UI would have opened without a human tap. */
export const GOOGLE_GESTURE_BLOCKED_MESSAGE =
  'Google sign-in can only start from a tap inside the app. Tap "Connect Google" to reconnect.';
