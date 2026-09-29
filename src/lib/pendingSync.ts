import { CloudWorkspace } from './cloudWorkspace';
import { LendItem, Transaction } from '../types/finance';

interface PendingSync {
  transactionUpserts: Record<string, Transaction>;
  transactionDeletes: string[];
  lendUpserts: Record<string, LendItem>;
  lendDeletes: string[];
  settingsDirty: boolean;
}

const keyFor = (email?: string | null) => `spenddesk_pending_sync_v1_${(email || 'guest').trim().toLowerCase()}`;
const empty = (): PendingSync => ({ transactionUpserts: {}, transactionDeletes: [], lendUpserts: {}, lendDeletes: [], settingsDirty: false });
export const loadPendingSync = (email?: string | null): PendingSync => {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(keyFor(email)) || '{}') }; } catch { return empty(); }
};
const save = (email: string | null | undefined, pending: PendingSync) => localStorage.setItem(keyFor(email), JSON.stringify(pending));
export const hasPendingSync = (email?: string | null) => {
  const p = loadPendingSync(email);
  return p.settingsDirty || Object.keys(p.transactionUpserts).length > 0 || p.transactionDeletes.length > 0 || Object.keys(p.lendUpserts).length > 0 || p.lendDeletes.length > 0;
};
export const clearPendingSync = (email?: string | null) => localStorage.removeItem(keyFor(email));
export const markTransactionUpsert = (tx: Transaction, email?: string | null) => { const p = loadPendingSync(email); p.transactionUpserts[tx.id] = tx; p.transactionDeletes = p.transactionDeletes.filter((id) => id !== tx.id); save(email, p); };
export const markTransactionDelete = (id: string, email?: string | null) => { const p = loadPendingSync(email); delete p.transactionUpserts[id]; if (!p.transactionDeletes.includes(id)) p.transactionDeletes.push(id); save(email, p); };
export const markLendUpsert = (item: LendItem, email?: string | null) => { const p = loadPendingSync(email); p.lendUpserts[item.id] = item; p.lendDeletes = p.lendDeletes.filter((id) => id !== item.id); save(email, p); };
export const markLendDelete = (id: string, email?: string | null) => { const p = loadPendingSync(email); delete p.lendUpserts[id]; if (!p.lendDeletes.includes(id)) p.lendDeletes.push(id); save(email, p); };
export const markSettingsDirty = (email?: string | null) => { const p = loadPendingSync(email); p.settingsDirty = true; save(email, p); };

// Before a local-only sign-out, stage the complete current workspace. This
// gives the next sign-in a durable baseline even if the browser is closed
// while offline, then later edits/deletes refine that baseline.
export const stageWorkspaceForReplay = (transactions: Transaction[], lends: LendItem[], email?: string | null) => {
  const p = loadPendingSync(email);
  transactions.forEach((tx) => { p.transactionUpserts[tx.id] = tx; });
  lends.forEach((item) => { p.lendUpserts[item.id] = item; });
  p.settingsDirty = true;
  save(email, p);
};

// Always pull the remote workspace first, then replay offline operations in their saved order.
export const mergePendingWorkspace = (remote: CloudWorkspace, local: CloudWorkspace, pending: PendingSync, updatedAt: number): CloudWorkspace => {
  const txs = new Map(remote.transactions.map((tx) => [tx.id, tx]));
  pending.transactionDeletes.forEach((id) => txs.delete(id));
  Object.values(pending.transactionUpserts).forEach((tx) => txs.set(tx.id, tx));
  const lends = new Map(remote.lendItems.map((item) => [item.id, item]));
  pending.lendDeletes.forEach((id) => lends.delete(id));
  Object.values(pending.lendUpserts).forEach((item) => lends.set(item.id, item));
  return {
    ...(pending.settingsDirty ? local : remote),
    transactions: Array.from(txs.values()).sort((a, b) => b.createdAt - a.createdAt),
    lendItems: Array.from(lends.values()).sort((a, b) => b.createdAt - a.createdAt),
    version: 1,
    updatedAt,
  };
};
