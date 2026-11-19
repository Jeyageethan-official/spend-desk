import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dedupeGoogleSpreadsheets } from '../src/lib/googleSheetsCollections';
import { googleProxyResponse } from '../src/lib/googleSheetsResponse';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('proxy response handling never attaches a body to bodyless Google statuses', async () => {
  for (const status of [204, 205, 304]) {
    const response = googleProxyResponse('ignored', status, 'application/json');
    assert.equal(response.status, status);
    assert.equal(await response.text(), '');
  }
  assert.equal(await googleProxyResponse('{"ok":true}', 200, 'application/json').text(), '{"ok":true}');
});

test('Drive spreadsheet deduplication is by spreadsheet ID, never title', () => {
  const sheets = dedupeGoogleSpreadsheets([
    { id: ' one ', name: 'Budget' },
    { id: 'one', name: 'Duplicate response' },
    { id: 'two', name: 'Budget' },
  ]);
  assert.deepEqual(sheets.map((sheet) => [sheet.id, sheet.name]), [['one', 'Budget'], ['two', 'Budget']]);
});

test('secure Sheets proxy allows required PUT operations and does not expose a Google token', () => {
  const proxy = read('supabase/functions/google-sheets-api/index.ts');
  assert.match(proxy, /\['GET', 'POST', 'PUT', 'DELETE'\]/);
  assert.match(proxy, /Authorization: `Bearer \$\{access\.token\}`/);
  assert.doesNotMatch(proxy, /access_token:/);
});

test('account replacement uses the chooser while retaining the old connection until callback success', () => {
  const oauth = read('supabase/functions/google-sheets-oauth/index.ts');
  assert.match(oauth, /prompt', 'select_account consent'/);
  assert.match(oauth, /state_hash = \$\{await sha256\(state\)\} and used_at is null and expires_at > now\(\)/);
  assert.match(oauth, /if \(!exchange\?\.ok \|\| typeof tokenSet\?\.refresh_token !== 'string'\)/);
  assert.match(oauth, /on conflict \(user_id\) do update set refresh_token_ciphertext/);
});

test('Sheets Manager uses secure connection controls and never auto-selects a Drive spreadsheet', () => {
  const manager = read('src/components/SheetManagerView.tsx');
  assert.match(manager, /startSecureGoogleSheetsConnection/);
  assert.match(manager, /disconnectSecureGoogleSheets/);
  assert.match(manager, /Switch account/);
  assert.match(manager, /dedupeGoogleSpreadsheets/);
  assert.doesNotMatch(manager, /auto-connect the best matching Drive sheet/i);
});

test('secure frontend creates a bodyless Response for Google 204 responses', () => {
  const frontend = read('src/lib/secureGoogleSheets.ts');
  assert.match(frontend, /googleProxyResponse/);
  assert.doesNotMatch(frontend, /new Response\(result\.body \|\| ''/);
});
