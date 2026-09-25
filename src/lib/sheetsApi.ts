import { Transaction, SpendingSummary, CategorySummary, LendItem } from '../types/finance';

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
    throw new Error(`Failed to list spreadsheets: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return data.files || [];
};

export const createMoneyTrackerSpreadsheet = async (
  accessToken: string,
  customTitle: string = 'Money Tracker - Cash & Card'
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
    throw new Error(`Failed to create spreadsheet: ${res.status} ${errorText}`);
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
  // Set up Transactions headers
  const txHeaderBody = {
    values: [
      ['Transaction ID', 'Date', 'Time', 'Type', 'Category', 'Amount (Rs)', 'Payment Method', 'Notes', 'Created At'],
    ],
  };

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A1:I1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(txHeaderBody),
    }
  );

  // Set up Lend_Borrow headers
  const lendHeaderBody = {
    values: [
      ['Record ID', 'Person Name', 'Type (Lent/Borrowed)', 'Things / Reason', 'Amount (Rs)', 'Date', 'Due Date', 'Status', 'Phone'],
    ],
  };

  await fetch(
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
    ['MONEY TRACKER', '', '', '', '', '', '', '', '', '', 'Date:', todayStr, '', ''],
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

  await fetch(
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

  await fetch(
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
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A2:I1000`,
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
  const rows: any[][] = data.values || [];

  return rows
    .filter((row) => row && row[0] && row[4] !== undefined)
    .map((row) => ({
      id: String(row[0]),
      date: String(row[1] || ''),
      time: String(row[2] || ''),
      type: (row[3] as any) || 'cash_expense',
      category: (row[4] as any) || 'Other',
      amount: parseFloat(String(row[5] || '0').replace(/[^0-9.-]+/g, '')) || 0,
      paymentMethod: (row[6] as any) || 'Cash',
      notes: String(row[7] || ''),
      createdAt: row[8] ? new Date(row[8]).getTime() : Date.now(),
    }));
};

export const overwriteTransactionsInSheet = async (
  accessToken: string,
  spreadsheetId: string,
  transactions: Transaction[]
) => {
  // Clear existing transactions
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A2:I1000:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (transactions.length === 0) return;

  const rows = transactions.map((tx) => [
    tx.id,
    tx.date,
    tx.time || '',
    tx.type,
    tx.category,
    tx.amount,
    tx.paymentMethod,
    tx.notes || '',
    new Date(tx.createdAt).toISOString(),
  ]);

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A2?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    }
  );
};

export const overwriteLendItemsInSheet = async (
  accessToken: string,
  spreadsheetId: string,
  lendItems: LendItem[]
) => {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Lend_Borrow!A2:I500:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (lendItems.length === 0) return;

  const rows = lendItems.map((item) => [
    item.id,
    item.personName,
    item.type === 'lent' ? 'I Lent' : 'I Borrowed',
    item.thingsOrReason,
    item.amount,
    item.date,
    item.dueDate || '',
    item.status,
    item.phone || '',
  ]);

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Lend_Borrow!A2?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    }
  );
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

