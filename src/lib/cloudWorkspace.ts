import { RealtimeChannel } from '@supabase/supabase-js';
import { BudgetConfig, GoogleSheetMeta, LendItem, Transaction } from '../types/finance';
import { CategoryDef, TelegramAlertConfig, UserProfile } from './storage';
import { getSupabase } from './supabase';

export interface CloudWorkspace {
  version: 1;
  updatedAt: number;
  transactions: Transaction[];
  lendItems: LendItem[];
  categories: CategoryDef[];
  budgetConfig: BudgetConfig;
  alertPhone: string;
  telegramAlertConfig: TelegramAlertConfig;
  activeSheet: GoogleSheetMeta | null;
  profile: UserProfile;
  currency: string;
  dailyRefresh?: boolean;
  /** Tombstones travel with the workspace so a delete stays deleted on every
   *  device: without them another device's stale push resurrects the record. */
  deletedTxIds?: string[];
  deletedLendIds?: string[];
}

let activeWorkspaceChannel: RealtimeChannel | null = null;
let postgresChannel: RealtimeChannel | null = null;
let localBroadcast: BroadcastChannel | null | undefined;

// One shared BroadcastChannel for the whole app. Creating a fresh channel per
// call (the old behaviour) leaked channels whose onmessage handlers still fired
// with stale closures - a second apply of old workspace data.
const getLocalBroadcast = (): BroadcastChannel | null => {
  if (localBroadcast !== undefined) return localBroadcast;
  localBroadcast = null;
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      localBroadcast = new BroadcastChannel('spenddesk_workspace_sync');
    }
  } catch {
    // Safari Private Browsing or tracking protection blocks BroadcastChannel
  }
  return localBroadcast;
};

const getCurrentUserId = async (): Promise<string | null> => {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (session?.user?.id) return session.user.id;
  const { data: { user } } = await getSupabase().auth.getUser();
  return user?.id || null;
};

export const fetchCloudWorkspace = async (): Promise<CloudWorkspace | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data, error } = await getSupabase()
    .from('user_workspaces')
    .select('workspace')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.workspace as CloudWorkspace | null;
};

export const saveCloudWorkspace = async (workspace: CloudWorkspace): Promise<void> => {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Sign in is required for cloud sync.');

  // 1. Broadcast locally across tabs in the same browser immediately (0ms)
  const localBc = getLocalBroadcast();
  if (localBc) {
    try {
      localBc.postMessage({ workspace });
    } catch (e) {
      console.warn('Local broadcast error:', e);
    }
  }

  // 2. Broadcast to other connected devices via Supabase Realtime WebSocket immediately (<50ms)
  if (activeWorkspaceChannel) {
    try {
      void activeWorkspaceChannel.send({
        type: 'broadcast',
        event: 'workspace_update',
        payload: { workspace },
      });
    } catch (e) {
      console.warn('Realtime channel broadcast error:', e);
    }
  }

  // 3. Persist to PostgreSQL database for offline & durable storage
  const { error } = await getSupabase()
    .from('user_workspaces')
    .upsert({ user_id: userId, workspace }, { onConflict: 'user_id' });
  if (error) throw error;
};

export const subscribeToCloudWorkspace = async (
  onWorkspace: (workspace: CloudWorkspace) => void
): Promise<RealtimeChannel | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const handleWorkspace = (ws: CloudWorkspace | undefined) => {
    if (ws) onWorkspace(ws);
  };

  // Listen to cross-tab updates in the same browser (shared singleton)
  const localBc = getLocalBroadcast();
  if (localBc) {
    try {
      localBc.onmessage = (event) => {
        handleWorkspace(event.data?.workspace as CloudWorkspace | undefined);
      };
    } catch (e) {
      console.warn('Local broadcast listen error:', e);
    }
  }

  // Primary channel: pure WebSocket Broadcast - works with no table/publication
  // configuration, and it is the path that must never fail for realtime to work.
  const channel = getSupabase()
    .channel(`spenddesk-workspace-${userId}`)
    .on('broadcast', { event: 'workspace_update' }, (payload) => {
      handleWorkspace(payload.payload?.workspace as CloudWorkspace | undefined);
    })
    .subscribe();

  activeWorkspaceChannel = channel;

  // Best-effort Postgres Changes on a SEPARATE channel. If the table is not in
  // the realtime publication the old single-channel setup degraded to
  // CHANNEL_ERROR and took the broadcast down with it - splitting them keeps
  // realtime alive either way.
  try {
    postgresChannel = getSupabase()
      .channel(`spenddesk-workspace-db-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_workspaces',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        handleWorkspace((payload.new as { workspace?: CloudWorkspace })?.workspace);
      })
      .subscribe();
  } catch (e) {
    console.warn('Postgres changes subscribe skipped:', e);
    postgresChannel = null;
  }

  return channel;
};

export const unsubscribeFromCloudWorkspace = (channel: RealtimeChannel | null) => {
  if (activeWorkspaceChannel === channel) {
    activeWorkspaceChannel = null;
  }
  if (postgresChannel) {
    void getSupabase().removeChannel(postgresChannel);
    postgresChannel = null;
  }
  const localBc = getLocalBroadcast();
  if (localBc) {
    try { localBc.onmessage = null; } catch {}
  }
  if (channel) void getSupabase().removeChannel(channel);
};
