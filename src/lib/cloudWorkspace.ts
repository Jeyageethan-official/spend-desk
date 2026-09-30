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
}

let activeWorkspaceChannel: RealtimeChannel | null = null;
const localBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('spenddesk_workspace_sync')
  : null;

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
  if (localBroadcast) {
    try {
      localBroadcast.postMessage({ workspace });
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

  // Listen to cross-tab updates in the same browser
  if (localBroadcast) {
    localBroadcast.onmessage = (event) => {
      const ws = event.data?.workspace as CloudWorkspace | undefined;
      if (ws) onWorkspace(ws);
    };
  }

  // Realtime channel with both WebSocket Broadcast and Postgres Changes
  const channel = getSupabase()
    .channel(`spenddesk-workspace-${userId}`)
    .on('broadcast', { event: 'workspace_update' }, (payload) => {
      const ws = payload.payload?.workspace as CloudWorkspace | undefined;
      if (ws) onWorkspace(ws);
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'user_workspaces',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      const ws = (payload.new as { workspace?: CloudWorkspace })?.workspace;
      if (ws) onWorkspace(ws);
    });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      activeWorkspaceChannel = channel;
    }
  });

  activeWorkspaceChannel = channel;
  return channel;
};

export const unsubscribeFromCloudWorkspace = (channel: RealtimeChannel | null) => {
  if (activeWorkspaceChannel === channel) {
    activeWorkspaceChannel = null;
  }
  if (channel) void getSupabase().removeChannel(channel);
};
