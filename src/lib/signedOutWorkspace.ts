import { CloudWorkspace } from './cloudWorkspace';

const keyFor = (email: string) => `spenddesk_signed_out_workspace_v1_${email.trim().toLowerCase()}`;

export const saveSignedOutWorkspace = (email: string, workspace: CloudWorkspace) => {
  try { localStorage.setItem(keyFor(email), JSON.stringify(workspace)); } catch (error) { console.error('Could not stage signed-out workspace:', error); }
};

export const loadSignedOutWorkspace = (email?: string | null): CloudWorkspace | null => {
  if (!email?.trim()) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(email)) || 'null');
    return parsed?.version === 1 ? parsed as CloudWorkspace : null;
  } catch { return null; }
};

export const clearSignedOutWorkspace = (email?: string | null) => {
  if (!email?.trim()) return;
  try { localStorage.removeItem(keyFor(email)); } catch {}
};
