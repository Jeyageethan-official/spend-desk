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

const getCurrentUserId = async (): Promise<string | null> => {
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
  return getSupabase()
    .channel(`spenddesk-workspace-${userId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'user_workspaces',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      const workspace = (payload.new as { workspace?: CloudWorkspace }).workspace;
      if (workspace) onWorkspace(workspace);
    })
    .subscribe();
};

export const unsubscribeFromCloudWorkspace = (channel: RealtimeChannel | null) => {
  if (channel) void getSupabase().removeChannel(channel);
};
