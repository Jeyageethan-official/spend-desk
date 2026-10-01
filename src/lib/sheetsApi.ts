import { Transaction, SpendingSummary, CategorySummary, LendItem, TransactionType, LendType, LendStatus } from '../types/finance';
import { signInWithGoogleWorkspace, getCachedWorkspaceToken, setCachedWorkspaceToken } from './workspaceAuth';
import { sortTransactionsChronological, calculateRunningBalances } from './calculations';

// Use the officially provisioned and authorized OAuth Client ID for this applet
export const GOOGLE_OAUTH_CLIENT_ID = '509348493041-ih637992a2lrmh6qdlvch1pkatpn70k0.apps.googleusercontent.com';

export const getGoogleClientId = (): string => {
  return GOOGLE_OAUTH_CLIENT_ID;
};

export const getStoredAccessToken = (): string | null => {
  try {
    const cached = getCachedWorkspaceToken();
    if (cached) return cached;
    return localStorage.getItem('money_tracker_access_token');
  } catch {
    return null;
  }
};

/**
 * Single Google OAuth Access Token Request.
 * Uses official Workspace OAuth integration flow.
 */
export const requestGoogleAccessToken = async (promptUser = true): Promise<string> => {
  const existing = getStoredAccessToken();
  if (existing && existing !== 'local_token' && !existing.startsWith('eyJ') && existing.length > 20) {
    return existing;
  }

  // In background or silent mode, never invoke GIS or OAuth redirects to avoid browser popup blocks
  if (!promptUser) {
    return '';
  }

  // Attempt Google Identity Services (GIS) token request only when user initiated an action
  if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2?.initTokenClient) {
    try {
      const tokenPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('GIS timeout')), 8000);
        try {
          const client = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_OAUTH_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
            prompt: '',
            callback: (res: any) => {
              clearTimeout(timeout);
              if (res?.access_token && !res.access_token.startsWith('eyJ')) {
                setCachedWorkspaceToken(res.access_token);
                resolve(res.access_token);
              } else if (res?.error) {
                reject(new Error(res.error_description || res.error));
              } else {
                reject(new Error('No token returned from GIS'));
              }
            },
            error_callback: (err: any) => {
              clearTimeout(timeout);
              reject(err);
            },
          });
          client.requestAccessToken({ prompt: '' });
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });
      const resToken = await tokenPromise;
      if (resToken) return resToken;
    } catch (e) {
      console.warn('GIS token request note:', e);
    }
  }

  const { accessToken } = await signInWithGoogleWorkspace();
  return accessToken;
};

/**
 * Fetch Google User Info using OAuth access token
 */
export const fetchGoogleUserInfo = async (accessToken: string): Promise<{
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}> => {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch Google user profile.');
  }
  return await res.json();
};

/**
 * Helper to extract Google Spreadsheet ID from either a full URL or a raw ID string.
 */
export const extractSpreadsheetId = (input: string): string => {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }
  return '';
};

/**
 * Fetch Google Spreadsheet Title to verify access and get clean display name
 */
export const fetchSpreadsheetTitle = async (accessToken: string, spreadsheetId: string): Promise<string> => {
  try {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      return data?.properties?.title || 'Google Sheet';
    }
  } catch (e) {
    console.warn('Could not fetch spreadsheet title:', e);
  }
  return 'Google Sheet';
};

const parseGoogleApiError = (status: number, errorText: string, defaultContext: string): Error => {
  let message = errorText;
  try {
    const json = JSON.parse(errorText);
    message = json?.error?.message || errorText;
  } catch (e) {}

  if (message.includes('Google Sheets API has not been used') || message.includes('sheets.googleapis.com') || message.includes('SERVICE_DISABLED')) {
    return new Error('GOOGLE_SHEETS_API_DISABLED: Google Sheets API is not enabled in your Google Cloud Console project.');
  }

  if (message.includes('Google Drive API has not been used') || message.includes('drive.googleapis.com')) {
    return new Error('GOOGLE_DRIVE_API_DISABLED: Google Drive API is not enabled in your Google Cloud Console project.');
  }

  return new Error(`${defaultContext}: (${status}) ${message}`);
};

export interface DriveSpreadsheetItem {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export const listUserSpreadsheets = async (accessToken: string): Promise<DriveSpreadsheetItem[]> => {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,modifiedTime)&orderBy=modifiedTime desc&pageSize=30`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw parseGoogleApiError(res.status, errorText, 'Failed to list spreadsheets');
  }

  const data = await res.json();
  return data.files || [];
};

/** Permanently deletes a spreadsheet from this user's Google Drive. */
export const deleteUserSpreadsheet = async (accessToken: string, spreadsheetId: string): Promise<void> => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw parseGoogleApiError(res.status, await res.text(), 'Failed to delete the spreadsheet');
  }
};

export const createMoneyTrackerSpreadsheet = async (
  accessToken: string,
  customTitle: string = 'SpendDesk - Cash & Card'
): Promise<{ id: string; name: string; url: string }> => {
  const body = {
    properties: {
      title: customTitle,
      locale: 'en',
    },
    sheets: [
      {
        properties: {
          title: 'Dashboard',
          gridProperties: {
            rowCount: 35,
            columnCount: 16,
          },
        },
      },
      {
        properties: {
          title: 'Transactions',
          gridProperties: {
            rowCount: 1000,
            columnCount: 10,
          },
        },
      },
      {
        properties: {
          title: 'Lend_Borrow',
          gridProperties: {
            rowCount: 500,
            columnCount: 10,
          },
        },
      },
    ],
  };

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw parseGoogleApiError(res.status, errorText, 'Failed to create spreadsheet');
  }

  const result = await res.json();
  const spreadsheetId = result.spreadsheetId;
  const webViewUrl = result.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Initialize header rows on both sheets
  await initializeSheetLayout(accessToken, spreadsheetId);

  return {
    id: spreadsheetId,
    name: customTitle,
    url: webViewUrl,
  };
};

export const initializeSheetLayout = async (accessToken: string, spreadsheetId: string) => {
  // Set up Transactions headers matching user screenshot layout:
  // Cols: Date, Time, Type, Category, Amount, Note, Payment Method, Balance, [spacer], Out of Wallet, Card Payment, [spacer], [spacer], Date & Time, Amount, Reason / Person, ID
  const txHeaderBody = {
    values: [
      [
        'Date',
        'Time',
        'Type',
        'Category',
        'Amount',
        'Note',
        'Payment Method',
        'Balance',
        '',
        'Out of Wallet',
        'Card Payment',
        '',
        '',
        'Date & Time',
        'Amount',
        'Reason / Person',
        'Transaction ID'
      ],
      [
        '', '', '', '', '', '', '', '', '', '', '', '', '',
        'LEND MONEY', '', '', ''
      ]
    ],
  };

  const txHeaderResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A1:Q2?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(txHeaderBody),
    }
  );
  if (!txHeaderResponse.ok) {
    throw parseGoogleApiError(txHeaderResponse.status, await txHeaderResponse.text(), 'Failed to create transaction headers');
  }

  // Set up Lend_Borrow headers (Tab 3: dedicated full Lend & Borrow ledger)
  const lendHeaderBody = {
    values: [
      ['Record ID', 'Person Name', 'Type (Lent/Borrowed)', 'Things / Reason', 'Amount (Rs)', 'Date', 'Due Date', 'Status', 'Phone'],
    ],
  };

  const lendHeaderResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Lend_Borrow!A1:I1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lendHeaderBody),
    }
  );

  // Set up Dashboard matching user layout
  const todayStr = new Date().toISOString().split('T')[0];
  const dashboardValues = [
    ['SPENDDESK', '', '', '', '', '', '', '', '', '', 'Date:', todayStr, '', ''],
    ['Cash wallet + Card spend tracker', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['CURRENT BALANCE (CASH)', '', '', '', '', 'Filter:', 'Overview', '', '', '', 'Food', 0, 'Mon', 0],
    ['Rs 0.00', '', '', '', '', '', '', '', '', '', 'Transport', 0, 'Tue', 0],
    ['', '', '', '', '', '', '', '', '', '', 'Shopping', 0, 'Wed', 0],
    ['', '', '', '', '', '', '', '', '', '', 'Bills', 0, 'Thu', 0],
    ['CASH ADDED', 'CASH SPENT', 'CARD SPEND', 'TOTAL SPEND', 'OUT OF WALLET', '', '', '', '', '', 'Entertainment', 0, 'Fri', 0],
    ['Rs 0.00', 'Rs 0.00', 'Rs 0.00', 'Rs 0.00', 'Rs 0.00', '', '', '', '', '', 'Education', 0, 'Sat', 0],
    ['', '', '', '', '', '', '', '', '', '', 'Other', 0, 'Sun', 0],
    ['SPENDING BY CATEGORY', '', '', '', '', 'SPENDING TREND (DAILY)', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Category', 'Amount (Rs)', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Food', 'Rs 0.00', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Transport', 'Rs 0.00', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Shopping', 'Rs 0.00', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Bills', 'Rs 0.00', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Entertainment', 'Rs 0.00', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Education', 'Rs 0.00', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Other', 'Rs 0.00', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];

  const writeResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Dashboard!A1:N20?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: dashboardValues }),
    }
  );
  if (!writeResponse.ok) {
    throw parseGoogleApiError(writeResponse.status, await writeResponse.text(), 'Failed to save transactions');
  }
};

export const syncDashboardStats = async (
  accessToken: string,
  spreadsheetId: string,
  summary: SpendingSummary,
  categories: CategorySummary[],
  dailySpend: { [day: string]: number }
) => {
  const formatRs = (n: number) => `Rs ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const updateCalls = [
    // Current Balance
    {
      range: 'Dashboard!A5',
      values: [[formatRs(summary.currentCashBalance)]],
    },
    // Metrics row
    {
      range: 'Dashboard!A9:E9',
      values: [[
        formatRs(summary.cashAdded),
        formatRs(summary.cashSpent),
        formatRs(summary.cardSpend),
        formatRs(summary.totalSpend),
        formatRs(summary.outOfWallet),
      ]],
    },
    // Category Breakdown rows
    {
      range: 'Dashboard!B14:B20',
      values: [
        [formatRs(categories.find(c => c.category === 'Food')?.amount || 0)],
        [formatRs(categories.find(c => c.category === 'Transport')?.amount || 0)],
        [formatRs(categories.find(c => c.category === 'Shopping')?.amount || 0)],
        [formatRs(categories.find(c => c.category === 'Bills')?.amount || 0)],
        [formatRs(categories.find(c => c.category === 'Entertainment')?.amount || 0)],
        [formatRs(categories.find(c => c.category === 'Education')?.amount || 0)],
        [formatRs(categories.find(c => c.category === 'Other')?.amount || 0)],
      ],
    },
    // Side Table Category amounts
    {
      range: 'Dashboard!L4:L10',
      values: [
        [categories.find(c => c.category === 'Food')?.amount || 0],
        [categories.find(c => c.category === 'Transport')?.amount || 0],
        [categories.find(c => c.category === 'Shopping')?.amount || 0],
        [categories.find(c => c.category === 'Bills')?.amount || 0],
        [categories.find(c => c.category === 'Entertainment')?.amount || 0],
        [categories.find(c => c.category === 'Education')?.amount || 0],
        [categories.find(c => c.category === 'Other')?.amount || 0],
      ],
    },
    // Mon-Sun Daily trend
    {
      range: 'Dashboard!N4:N10',
      values: [
        [dailySpend['Mon'] || 0],
        [dailySpend['Tue'] || 0],
        [dailySpend['Wed'] || 0],
        [dailySpend['Thu'] || 0],
        [dailySpend['Fri'] || 0],
        [dailySpend['Sat'] || 0],
        [dailySpend['Sun'] || 0],
      ],
    },
  ];

  const statsResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updateCalls,
      }),
    }
  );
  if (!statsResponse.ok) {
    throw parseGoogleApiError(statsResponse.status, await statsResponse.text(), 'Failed to update dashboard totals');
  }
};

export const appendTransactionRow = async (
  accessToken: string,
  spreadsheetId: string,
  tx: Transaction
) => {
  const row = [
    tx.id,
    tx.date,
    tx.time || '',
    tx.type,
    tx.category,
    tx.amount,
    tx.paymentMethod,
    tx.notes || '',
    new Date(tx.createdAt).toISOString(),
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [row],
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to append transaction: ${res.status} ${errorText}`);
  }

  return await res.json();
};

export const fetchAllTransactionsFromSheet = async (
  accessToken: string,
  spreadsheetId: string
): Promise<Transaction[]> => {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A1:Z2000`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch transactions: ${res.status} ${error}`);
  }

  const data = await res.json();
  const allRows: any[][] = data.values || [];
  if (allRows.length <= 1) return [];

  const headerRow = (allRows[0] || []).map((h) => String(h || '').trim().toLowerCase());
  const dataRows = allRows.slice(1);

  const findCol = (regex: RegExp, fallback: number) => {
    const idx = headerRow.findIndex((h) => regex.test(h));
    return idx >= 0 ? idx : fallback;
  };

  const dateCol = findCol(/date/i, 0);
  const timeCol = findCol(/time/i, 1);
  const typeCol = findCol(/type/i, 2);
  const catCol = findCol(/categor/i, 3);
  const amtCol = findCol(/amount|rs|price|cost/i, 4);
  const notesCol = findCol(/note|desc|reason|remark/i, 5);
  const paymentCol = findCol(/payment|method|mode/i, 6);
  const idCol = findCol(/id/i, 16);
  const createdCol = findCol(/created/i, 17);

  const parsedTxs: Transaction[] = [];

  dataRows.forEach((row, idx) => {
    if (!row || row.length === 0) return;
    const hasAnyContent = row.some((cell) => cell !== undefined && String(cell).trim() !== '');
    if (!hasAnyContent) return;

    // Skip secondary header rows (e.g. "LEND MONEY" row)
    const firstCell = String(row[0] || '').trim().toLowerCase();
    const secondCell = String(row[1] || '').trim().toLowerCase();
    const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('lend money') || firstCell === 'date' || secondCell === 'time') return;

    let rawAmount = row[amtCol];
    if (rawAmount === undefined || String(rawAmount).trim() === '') {
      for (let c = 0; c < Math.min(row.length, 9); c++) {
        if (c !== dateCol && c !== timeCol && c !== idCol) {
          const testNum = parseFloat(String(row[c] || '').replace(/[^0-9.-]+/g, ''));
          if (!isNaN(testNum) && testNum > 0) {
            rawAmount = row[c];
            break;
          }
        }
      }
    }
    const amount = parseFloat(String(rawAmount || '0').replace(/[^0-9.-]+/g, '')) || 0;

    // Strict validation: Transaction must have positive amount
    if (amount <= 0 || isNaN(amount)) return;

    let rawDate = String(row[dateCol] || '').trim();
    if (!rawDate && String(row[0] || '').match(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/)) {
      rawDate = String(row[0]).trim();
    }
    if (!rawDate) return;

    // Discard Excel date zero / 1899 / 1900 / 1970
    if (rawDate === '0' || rawDate.includes('1899') || rawDate.includes('1900') || rawDate.includes('1970')) {
      return;
    }

    let dateStr = '';
    if (rawDate) {
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(rawDate)) {
        const parts = rawDate.split(/[-/.]/);
        dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(rawDate)) {
        const parts = rawDate.split(/[-/.]/);
        dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().split('T')[0];
        }
      }
    }

    if (!dateStr || dateStr.startsWith('1899') || dateStr.startsWith('1900') || dateStr.startsWith('1970')) {
      return;
    }
    const year = parseInt(dateStr.split('-')[0], 10);
    if (isNaN(year) || year < 2000 || year > 2100) return;

    const rawType = String(row[typeCol] || '').toLowerCase().trim();
    let type: TransactionType = 'cash_expense';
    if (rawType === 'in' || rawType.startsWith('in') || rawType.includes('add') || rawType.includes('income') || rawType.includes('receiv') || rawType.includes('credit')) {
      type = 'cash_added';
    } else if (rawType.includes('card')) {
      type = 'card_expense';
    } else {
      type = 'cash_expense';
    }

    let category = String(row[catCol] || 'Other').trim();
    if (!category || category === '1000' || category === '0') category = 'Other';

    const rawPayment = String(row[paymentCol] || '').trim();
    let paymentMethod = 'Cash';
    if (rawPayment.toLowerCase().includes('card')) paymentMethod = 'Card';
    else if (rawPayment.toLowerCase().includes('bank') || rawPayment.toLowerCase().includes('transfer')) paymentMethod = 'Bank Transfer';
    else if (type === 'card_expense') paymentMethod = 'Card';

    let notes = String(row[notesCol] || '').trim();
    if (notes === '1000' && rawDate.includes('1899')) return; // ignore ghost row artifact

    let rawId = String(row[idCol] || '').trim();
    if (!rawId || rawId.includes('/') || rawId.includes(' ') || rawId.length < 3) {
      rawId = `tx_sheet_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
    }

    const rawCreated = row[createdCol];
    let createdAt = Date.now() - idx * 1000;
    if (rawCreated) {
      const cDate = new Date(rawCreated);
      if (!isNaN(cDate.getTime())) createdAt = cDate.getTime();
    }

    parsedTxs.push({
      id: rawId,
      date: dateStr,
      time: String(row[timeCol] || '').trim(),
      type,
      category: category as any,
      amount,
      paymentMethod: paymentMethod as any,
      notes,
      createdAt,
    });
  });

  return parsedTxs;
};

export const overwriteTransactionsInSheet = async (
  accessToken: string,
  spreadsheetId: string,
  transactions: Transaction[],
  lendItems?: LendItem[]
) => {
  // CRITICAL: Always clear all transaction rows from row 3 downwards first so deleted rows NEVER stay!
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A3:Q5000:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (clearErr) {
    console.warn('Could not clear old transaction rows:', clearErr);
  }

  if (transactions.length === 0 && (!lendItems || lendItems.length === 0)) {
    return;
  }

  const sorted = sortTransactionsChronological(transactions);
  const runningBalances = calculateRunningBalances(sorted);
  const safeLends = lendItems || [];

  const maxRowCount = Math.max(sorted.length, safeLends.length);
  const rows: any[][] = [];

  for (let i = 0; i < maxRowCount; i++) {
    const tx = sorted[i];
    const lend = safeLends[i];

    let rowData: any[] = [];
    if (tx) {
      const rb = runningBalances.get(tx.id);
      const bal = rb ? rb.balance : 0;
      const oow = rb ? rb.outOfWallet : 0;
      const isCard = tx.paymentMethod === 'Card' || tx.paymentMethod === 'Bank Transfer' || tx.type === 'card_expense';

      rowData = [
        tx.date || '',
        tx.time || '',
        tx.type === 'cash_added' ? 'IN' : 'OUT',
        tx.category || 'Other',
        `Rs ${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        tx.notes || '',
        tx.paymentMethod || 'Cash',
        `Rs ${bal.toLocaleString('en-US')}`,
        '', // Col I spacer
        oow > 0 ? `Rs -${oow.toLocaleString('en-US')}` : '', // Col J Out of Wallet
        isCard ? `Rs ${tx.amount.toLocaleString('en-US')}` : '', // Col K Card Payment
        '', // Col L spacer
        '', // Col M spacer
      ];
    } else {
      // Empty transaction cells
      rowData = ['', '', '', '', '', '', '', '', '', '', '', '', ''];
    }

    // Append LEND MONEY side widget columns (N, O, P)
    if (lend) {
      const lendDateTime = lend.date || '';
      const lendAmt = `Rs ${lend.amount.toLocaleString('en-US')}`;
      const lendReason = `${lend.personName}${lend.thingsOrReason ? ` - ${lend.thingsOrReason}` : ''}`;
      rowData.push(lendDateTime, lendAmt, lendReason);
    } else {
      rowData.push('', '', '');
    }

    // Col Q: Transaction ID metadata
    rowData.push(tx ? tx.id : '');

    rows.push(rowData);
  }

  const endRow = rows.length + 2; // Rows start at row 3
  const targetRange = `Transactions!A3:Q${endRow}`;

  const writeResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${targetRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: targetRange,
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );
  if (!writeResponse.ok) {
    throw parseGoogleApiError(writeResponse.status, await writeResponse.text(), 'Failed to save transactions to sheet');
  }
};

export const overwriteLendItemsInSheet = async (
  accessToken: string,
  spreadsheetId: string,
  lendItems: LendItem[]
) => {
  // Clear existing rows first
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Lend_Borrow!A2:Z1000:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.warn('Could not clear Lend_Borrow sheet:', err);
  }

  if (lendItems.length === 0) {
    return;
  }

  const rows = lendItems.map((item) => [
    item.id,
    item.personName || '',
    item.type === 'lent' ? 'I Lent' : 'I Borrowed',
    item.thingsOrReason || '',
    item.amount || 0,
    item.date || '',
    item.dueDate || '',
    item.status === 'settled' ? 'Settled' : 'Pending',
    item.phone || '',
  ]);

  const endRow = rows.length + 1;
  const targetRange = `Lend_Borrow!A2:I${endRow}`;

  const writeResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${targetRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: targetRange,
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );
  if (!writeResponse.ok) {
    throw parseGoogleApiError(writeResponse.status, await writeResponse.text(), 'Failed to save lend records to sheet');
  }

  if (endRow < 500) {
    void fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Lend_Borrow!A${endRow + 1}:I500:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    ).catch(console.warn);
  }
};

export const fetchAllLendItemsFromSheet = async (
  accessToken: string,
  spreadsheetId: string
): Promise<LendItem[]> => {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Lend_Borrow!A1:I500`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const allRows: any[][] = data.values || [];
    if (allRows.length <= 1) return [];

    const headerRow = (allRows[0] || []).map((h) => String(h || '').trim().toLowerCase());
    const dataRows = allRows.slice(1);

    const findCol = (regex: RegExp, fallback: number) => {
      const idx = headerRow.findIndex((h) => regex.test(h));
      return idx >= 0 ? idx : fallback;
    };

    const idCol = findCol(/id/i, 0);
    const personCol = findCol(/person|name|who/i, 1);
    const typeCol = findCol(/type|lent|borrow/i, 2);
    const reasonCol = findCol(/thing|reason|note|desc/i, 3);
    const amtCol = findCol(/amount|rs|price/i, 4);
    const dateCol = findCol(/date/i, 5);
    const dueDateCol = findCol(/due/i, 6);
    const statusCol = findCol(/status/i, 7);
    const phoneCol = findCol(/phone|mobile|contact/i, 8);

    const parsedLends: LendItem[] = [];

    dataRows.forEach((row, idx) => {
      if (!row || row.length === 0) return;
      const hasAnyContent = row.some((cell) => cell !== undefined && String(cell).trim() !== '');
      if (!hasAnyContent) return;

      let personName = String(row[personCol] || '').trim();
      let rawId = String(row[idCol] || '').trim();

      if (!personName && rawId && !rawId.startsWith('lend_') && isNaN(Number(rawId))) {
        personName = rawId;
        rawId = '';
      }

      if (!personName) return;

      if (!rawId || rawId.length < 3) {
        rawId = `lend_sheet_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
      }

      const rawType = String(row[typeCol] || '').toLowerCase();
      const type: LendType = (rawType.includes('borrow') || rawType.includes('taken')) ? 'borrowed' : 'lent';

      const amount = parseFloat(String(row[amtCol] || '0').replace(/[^0-9.-]+/g, '')) || 0;
      const thingsOrReason = String(row[reasonCol] || '').trim();
      const date = String(row[dateCol] || '').trim() || new Date().toISOString().split('T')[0];
      const dueDate = String(row[dueDateCol] || '').trim();

      const rawStatus = String(row[statusCol] || '').toLowerCase();
      const status: LendStatus = (rawStatus.includes('settle') || rawStatus.includes('return') || rawStatus.includes('paid')) ? 'settled' : 'pending';
      const phone = String(row[phoneCol] || '').trim();

      parsedLends.push({
        id: rawId,
        personName,
        type,
        thingsOrReason,
        amount,
        date,
        dueDate,
        status,
        phone,
        createdAt: Date.now() - idx * 1000,
      });
    });

    return parsedLends;
  } catch (e) {
    console.warn('Failed to fetch lend items from sheet:', e);
    return [];
  }
};

export const syncViaWebhook = async (
  webhookUrl: string, 
  transactions: Transaction[], 
  summary: SpendingSummary,
  lendItems?: LendItem[]
) => {
  const payload = {
    action: 'sync',
    updatedAt: new Date().toISOString(),
    summary,
    transactions,
    lendItems: lendItems || [],
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return { success: true };
};

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Transactions Sheet
  var txSheet = ss.getSheetByName("Transactions") || ss.insertSheet("Transactions");
  if (txSheet.getLastRow() === 0) {
    txSheet.appendRow(["ID", "Date", "Time", "Type", "Category", "Amount", "Payment Method", "Notes"]);
  }
  
  if (data.transactions && data.transactions.length > 0) {
    txSheet.getRange(2, 1, Math.max(1, txSheet.getLastRow() - 1), 8).clearContent();
    var rows = data.transactions.map(function(t) {
      return [t.id, t.date, t.time || '', t.type, t.category, t.amount, t.paymentMethod, t.notes || ''];
    });
    txSheet.getRange(2, 1, rows.length, 8).setValues(rows);
  }

  // 2. Lend_Borrow Sheet
  var lendSheet = ss.getSheetByName("Lend_Borrow") || ss.insertSheet("Lend_Borrow");
  if (lendSheet.getLastRow() === 0) {
    lendSheet.appendRow(["ID", "Person Name", "Type", "Things / Reason", "Amount", "Date", "Due Date", "Status", "Phone"]);
  }

  if (data.lendItems && data.lendItems.length > 0) {
    lendSheet.getRange(2, 1, Math.max(1, lendSheet.getLastRow() - 1), 9).clearContent();
    var lendRows = data.lendItems.map(function(l) {
      return [l.id, l.personName, l.type === 'lent' ? 'I Lent' : 'I Borrowed', l.thingsOrReason, l.amount, l.date, l.dueDate || '', l.status, l.phone || ''];
    });
    lendSheet.getRange(2, 1, lendRows.length, 9).setValues(lendRows);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}`;
