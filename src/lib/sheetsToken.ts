import { pushAuthTrace } from './authPhase';

/**
 * Compatibility shim for the retired browser token-mint endpoint. Secure
 * Sheets requests are routed through google-sheets-api and never expose a
 * Google credential to the browser.
 */

/** Ask our backend for a fresh Google Sheets/Drive access token. Zero Google UI. */
export const fetchSheetsTokenFromServer = async (): Promise<{
  token: string;
  expiresInSeconds: number;
} | null> => {
  pushAuthTrace('sheets_token_retired', {});
  return null;
};

/** Drop the in-memory server token (sign-out / account switch). */
export const clearServerSheetsToken = (): void => {
  // Kept as a call-site-compatible no-op while old clients are retired.
};
