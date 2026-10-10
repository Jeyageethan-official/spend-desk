import { getSupabase } from './supabase';

/**
 * Client for the server-side Telegram connection lifecycle
 * (supabase/functions/telegram-connect). Chat IDs, tokens and the bot token
 * never live in the browser — this only ever sees masked values and the
 * one-time deep link the current user just requested.
 */

export interface TelegramLinkStatus {
  connected: boolean;
  pending: boolean;
  alertsEnabled: boolean;
  chatIdMasked: string | null;
  linkedAt: string | null;
}

export interface TelegramLinkTicket {
  deepLink: string;
  botUsername: string;
  expiresInSeconds: number;
}

const FUNCTION_NAME = 'telegram-connect';

const invokeAction = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await getSupabase().functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    //404 = the server still runs an older setup without the connection functions.
    const status = (error as { context?: { status?: number } }).context?.status ?? 0;
    if (status === 404) {
      throw new Error(
        'Telegram connection is not available on this server yet. Ask for the latest SpendDesk server setup, then try again.'
      );
    }
    // FunctionsHttpError carries the response body; surface its friendly message
    // instead of a raw technical error.
    let serverMessage = '';
    try {
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
      const parsed = context ? await context.json() : null;
      if (parsed && typeof parsed === 'object') {
        const msg = (parsed as { error?: unknown }).error;
        if (typeof msg === 'string' && msg) serverMessage = msg;
      }
    } catch {
      /* fall through to generic message */
    }
    throw new Error(serverMessage || 'Could not reach the server. Check your connection and try again.');
  }
  const payload = data as (T & { error?: string }) | null;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected server response. Try again.');
  }
  if (payload.error) {
    throw new Error(payload.error);
  }
  return payload as T;
};

/** Ask the backend for a fresh single-use linking token + t.me deep link. */
export const createTelegramLink = (): Promise<TelegramLinkTicket> =>
  invokeAction<TelegramLinkTicket>({ action: 'create_link' });

/** Current user's connection state (never exposes raw chat IDs). */
export const getTelegramLinkStatus = (): Promise<TelegramLinkStatus> =>
  invokeAction<TelegramLinkStatus>({ action: 'status' });

/** Persist the per-user "Enable transaction alerts" preference server-side. */
export const setTelegramAlertsEnabled = (enabled: boolean): Promise<{ alertsEnabled: boolean }> =>
  invokeAction<{ alertsEnabled: boolean }>({ action: 'set_enabled', enabled });

/** Send a real test message through the bot to this user's linked chat. */
export const sendTelegramTestAlert = (): Promise<{ delivered: boolean }> =>
  invokeAction<{ delivered: boolean }>({ action: 'test' });

/** Disconnect this user's Telegram chat (other users are unaffected). */
export const disconnectTelegram = (): Promise<{ disconnected: boolean }> =>
  invokeAction<{ disconnected: boolean }>({ action: 'disconnect' });
