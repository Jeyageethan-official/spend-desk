/**
/**
 * Completely silent interaction engine.
 * No audio beeps or click sounds.
 */

export type FeedbackType = 'tap' | 'toggle' | 'success' | 'warning' | 'error';

export function triggerFeedback(_type: FeedbackType = 'tap') {
  // Completely silent - no audio synthesis or click sounds
}
