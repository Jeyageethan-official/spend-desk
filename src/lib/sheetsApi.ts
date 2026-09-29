import { Transaction, SpendingSummary, CategorySummary, LendItem } from '../types/finance';

export const GOOGLE_OAUTH_CLIENT_ID = '377806164433-ftqbldc3ul9jfenp00hcgveeonoifdjs.apps.googleusercontent.com';

export const getGoogleClientId = (): string => {
  try {
    const custom = localStorage.getItem('money_tracker_google_client_id');
    if (custom && (custom.includes('ftqbide3') || custom.includes('403491523597'))) {
      localStorage.removeItem('money_tracker_google_client_id');
    }
  } catch (e) {}
  return GOOGLE_OAUTH_CLIENT_ID;
};

/**
 * Modern Google Identity Services (GIS) Access Token Request.
 * Obtains a fresh Google OAuth access token with Sheets & Drive scopes.
 */
export const requestGoogleAccessToken = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) {
        reject(new Error('Google Identity script loading. Please try again in a moment.'));
        return;
      }
      const clientId = getGoogleClientId();

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          if (response.access_token) {
            try {
              localStorage.setItem('money_tracker_access_token', response.access_token);
            } catch (e) {}
            resolve(response.access_token);
          } else {
            reject(new Error('No access token received from Google.'));
          }
        },
        error_callback: (nonOAuthError: any) => {
          reject(new Error(nonOAuthError?.message || 'Google Auth dialog closed.'));
        }
      });
      client.requestAccessToken({ prompt: 'consent' });
    } catch (e: any) {
      reject(e);
    }
  });
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
  // Set up Transactions headers matching user's screenshot layout
  const txHeaderBody = {
    values: [
      ['Date', 'Time', 'Type', 'Category', 'Amount', 'Note', 'Payment Method', 'Balance', 'Out of Wallet', 'Card Payment', '', '', '', 'LEND MONEY', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', 'Date & Time', 'Amount', 'Reason / Person'],
    ],
  };

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A2:P3?valueInputOption=USER_ENTERED`,
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

  // Keep the visual language of every newly created workbook consistent. This only
  // changes presentation; transaction, lend and dashboard values stay in their
  // normal ranges so the sync code below continues to work unchanged.
  await applySpendDeskSheetDesign(accessToken, spreadsheetId);
};

type SheetDescriptor = { sheetId: number; title: string };

const getWorkbookSheets = async (accessToken: string, spreadsheetId: string): Promise<SheetDescriptor[]> => {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw parseGoogleApiError(res.status, await res.text(), 'Failed to prepare the spreadsheet design');
  }
  const data = await res.json();
  return (data.sheets || []).map((sheet: any) => sheet.properties);
};

const hexColor = (hex: string) => {
  const value = hex.replace('#', '');
  return {
    red: parseInt(value.slice(0, 2), 16) / 255,
    green: parseInt(value.slice(2, 4), 16) / 255,
    blue: parseInt(value.slice(4, 6), 16) / 255,
  };
};

const gridRange = (sheetId: number, startRow: number, endRow: number, startColumn: number, endColumn: number) => ({
  sheetId,
  startRowIndex: startRow,
  endRowIndex: endRow,
  startColumnIndex: startColumn,
  endColumnIndex: endColumn,
});

const solid = (hex: string) => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });

// This compact style pass only uses the most widely-supported Sheets requests.
// It is the fallback for older workbooks where a legacy merge/filter prevents a
// richer batch from being accepted. It never writes a value or clears a cell.
const applyCoreSheetDesign = async (accessToken: string, spreadsheetId: string, sheets: SheetDescriptor[]) => {
  const navy = '#0f2b5c';
  const emerald = '#059669';
  const mint = '#ECFDF5';
  const requests: any[] = [];
  const fill = (sheetId: number, startRow: number, endRow: number, startColumn: number, endColumn: number, color: string, textColor = '#FFFFFF') => requests.push({
    repeatCell: {
      range: gridRange(sheetId, startRow, endRow, startColumn, endColumn),
      cell: { userEnteredFormat: { backgroundColor: solid(color), textFormat: { foregroundColor: solid(textColor), bold: true }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment',
    },
  });
  const setWidth = (sheetId: number, column: number, pixelSize: number) => requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 }, properties: { pixelSize }, fields: 'pixelSize' } });

  sheets.forEach((sheet) => {
    if (!['Dashboard', 'Transactions', 'Lend_Borrow'].includes(sheet.title)) return;
    const isDashboard = sheet.title === 'Dashboard';
    requests.push({ updateSheetProperties: { properties: { sheetId: sheet.sheetId, tabColor: solid(isDashboard ? emerald : sheet.title === 'Transactions' ? navy : '#6366F1'), gridProperties: { frozenRowCount: isDashboard ? 2 : 2, hideGridlines: false } }, fields: 'tabColor,gridProperties.frozenRowCount,gridProperties.hideGridlines' } });
    if (isDashboard) {
      fill(sheet.sheetId, 0, 1, 0, 14, navy);
      fill(sheet.sheetId, 1, 2, 0, 14, mint, '#475569');
      fill(sheet.sheetId, 3, 4, 0, 2, emerald);
      fill(sheet.sheetId, 7, 8, 0, 5, navy);
      fill(sheet.sheetId, 10, 11, 0, 5, navy);
      fill(sheet.sheetId, 12, 13, 0, 2, emerald);
      [145, 135, 135, 135, 145, 95, 95, 95, 20, 20, 125, 100, 90, 90].forEach((size, index) => setWidth(sheet.sheetId, index, size));
    } else {
      fill(sheet.sheetId, 1, 2, 0, 10, navy);
      fill(sheet.sheetId, 1, 3, 13, 16, navy);
      const widths = [115, 85, 65, 125, 115, 160, 125, 115, 115, 115, 30, 30, 30, 160, 110, 170];
      widths.forEach((size, index) => setWidth(sheet.sheetId, index, size));
    }
  });
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
  });
  if (!response.ok) throw parseGoogleApiError(response.status, await response.text(), 'Failed to apply the spreadsheet design');
};

/**
 * Applies exact visual system matching user's screenshot to Google Sheets.
 */
export const applySpendDeskSheetDesign = async (accessToken: string, spreadsheetId: string): Promise<void> => {
  const sheets = await getWorkbookSheets(accessToken, spreadsheetId);
  const dashboard = sheets.find((sheet) => sheet.title === 'Dashboard');
  const transactions = sheets.find((sheet) => sheet.title === 'Transactions');
  const lendBorrow = sheets.find((sheet) => sheet.title === 'Lend_Borrow');
  const navy = '#0f2b5c';
  const emerald = '#059669';
  const mint = '#ECFDF5';
  const sky = '#EFF6FF';
  const rose = '#FFF1F2';
  const amber = '#FFFBEB';
  const slate = '#475569';
  const pale = '#F8FAFC';
  const requests: any[] = [];

  const setFill = (range: any, color: string, extra: any = {}) => requests.push({
    repeatCell: {
      range,
      cell: { userEnteredFormat: { backgroundColor: solid(color), ...extra } },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat,wrapStrategy)',
    },
  });
  const width = (sheetId: number, column: number, pixelSize: number) => requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 },
      properties: { pixelSize }, fields: 'pixelSize',
    },
  });
  const conditional = (sheetId: number, range: any, formula: string, color: string, textHex?: string) => requests.push({
    addConditionalFormatRule: {
      rule: { 
        ranges: [range], 
        booleanRule: { 
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, 
          format: { 
            backgroundColor: solid(color),
            ...(textHex ? { textFormat: { foregroundColor: solid(textHex), bold: true } } : {})
          } 
        } 
      },
      index: 0,
    },
  });

  if (dashboard) {
    const id = dashboard.sheetId;
    requests.push({ updateSheetProperties: { properties: { sheetId: id, tabColor: solid(emerald), gridProperties: { frozenRowCount: 2, hideGridlines: true } }, fields: 'tabColor,gridProperties.frozenRowCount,gridProperties.hideGridlines' } });
    requests.push({ unmergeCells: { range: gridRange(id, 0, 20, 0, 14) } });
    requests.push({ mergeCells: { range: gridRange(id, 0, 1, 0, 14), mergeType: 'MERGE_ALL' } });
    requests.push({ mergeCells: { range: gridRange(id, 1, 2, 0, 14), mergeType: 'MERGE_ALL' } });
    requests.push({ mergeCells: { range: gridRange(id, 4, 6, 0, 2), mergeType: 'MERGE_ALL' } });
    setFill(gridRange(id, 0, 1, 0, 14), navy, { textFormat: { foregroundColor: solid('#FFFFFF'), bold: true, fontSize: 18 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    setFill(gridRange(id, 1, 2, 0, 14), mint, { textFormat: { foregroundColor: solid(slate), bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    setFill(gridRange(id, 3, 4, 0, 2), emerald, { textFormat: { foregroundColor: solid('#FFFFFF'), bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    setFill(gridRange(id, 4, 6, 0, 2), '#E0F2FE', { textFormat: { foregroundColor: solid(navy), bold: true, fontSize: 22 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    setFill(gridRange(id, 3, 4, 5, 8), sky, { textFormat: { foregroundColor: solid(slate), bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER' });
    setFill(gridRange(id, 7, 8, 0, 5), navy, { textFormat: { foregroundColor: solid('#FFFFFF'), bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    [mint, rose, sky, rose, amber].forEach((color, index) => setFill(gridRange(id, 8, 9, index, index + 1), color, { textFormat: { foregroundColor: solid(index === 0 ? '#047857' : index === 2 ? '#1D4ED8' : '#BE123C'), bold: true, fontSize: 12 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }));
    setFill(gridRange(id, 10, 11, 0, 5), navy, { textFormat: { foregroundColor: solid('#FFFFFF'), bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER' });
    setFill(gridRange(id, 12, 13, 0, 2), emerald, { textFormat: { foregroundColor: solid('#FFFFFF'), bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER' });
    setFill(gridRange(id, 13, 20, 0, 2), '#FFFFFF', { textFormat: { foregroundColor: solid(slate), fontSize: 10 }, verticalAlignment: 'MIDDLE' });
    setFill(gridRange(id, 3, 10, 10, 14), pale, { textFormat: { foregroundColor: solid(slate), fontSize: 9 }, verticalAlignment: 'MIDDLE' });
    [145, 135, 135, 135, 145, 95, 95, 95, 20, 20, 125, 100, 90, 90].forEach((size, index) => width(id, index, size));
    [0, 1, 3, 7, 10, 12].forEach((row) => requests.push({ updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: row, endIndex: row + 1 }, properties: { pixelSize: row === 0 ? 36 : row === 1 ? 24 : 28 }, fields: 'pixelSize' } }));
  }

  if (transactions) {
    const id = transactions.sheetId;
    requests.push({ 
      updateSheetProperties: { 
        properties: { 
          sheetId: id, 
          tabColor: solid(navy), 
          gridProperties: { frozenRowCount: 2, hideGridlines: false } 
        }, 
        fields: 'tabColor,gridProperties.frozenRowCount,gridProperties.hideGridlines' 
      } 
    });

    // Merge LEND MONEY header over N2:P2
    requests.push({ unmergeCells: { range: gridRange(id, 1, 3, 13, 16) } });
    requests.push({ mergeCells: { range: gridRange(id, 1, 2, 13, 16), mergeType: 'MERGE_ALL' } });

    // Main Headers (Row 2 A2:J2)
    setFill(gridRange(id, 1, 2, 0, 10), navy, { 
      textFormat: { foregroundColor: solid('#FFFFFF'), bold: true, fontSize: 10 }, 
      horizontalAlignment: 'CENTER', 
      verticalAlignment: 'MIDDLE' 
    });

    // Lend Money Header (Row 2 N2:P2)
    setFill(gridRange(id, 1, 2, 13, 16), navy, { 
      textFormat: { foregroundColor: solid('#FFFFFF'), bold: true, fontSize: 10 }, 
      horizontalAlignment: 'CENTER', 
      verticalAlignment: 'MIDDLE' 
    });

    // Lend Money Subheaders (Row 3 N3:P3)
    setFill(gridRange(id, 2, 3, 13, 16), navy, { 
      textFormat: { foregroundColor: solid('#FFFFFF'), bold: true, fontSize: 10 }, 
      horizontalAlignment: 'CENTER', 
      verticalAlignment: 'MIDDLE' 
    });

    // Row heights for header rows
    requests.push({ updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 1, endIndex: 3 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } });

    // Column widths matching screenshot layout
    const widths = [115, 85, 65, 125, 115, 160, 125, 115, 115, 115, 30, 30, 30, 160, 110, 170];
    widths.forEach((size, index) => width(id, index, size));

    // Basic filters for transactions table
    requests.push({ setBasicFilter: { filter: { range: gridRange(id, 1, 1000, 0, 10) } } });

    // Formatting for IN / OUT types & amounts
    conditional(id, gridRange(id, 3, 1000, 2, 3), '=$C4="IN"', '#FFFFFF', '#008000');
    conditional(id, gridRange(id, 3, 1000, 2, 3), '=$C4="OUT"', '#FFFFFF', '#D93025');

    // Payment Method Pill formatting (light green background for Cash)
    conditional(id, gridRange(id, 3, 1000, 6, 7), '=$G4="Cash"', '#E6F4EA', '#008000');

    // Amount Column formatting (E)
    requests.push({ 
      repeatCell: { 
        range: gridRange(id, 3, 1000, 4, 5), 
        cell: { 
          userEnteredFormat: { 
            numberFormat: { type: 'CURRENCY', pattern: '"Rs" #,##0;[Red]-"Rs" #,##0' }, 
            horizontalAlignment: 'RIGHT', 
            textFormat: { bold: true } 
          } 
        }, 
        fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat.bold' 
      } 
    });

    // Balance Column formatting (H) - Dark Blue Bold text
    requests.push({ 
      repeatCell: { 
        range: gridRange(id, 3, 1000, 7, 8), 
        cell: { 
          userEnteredFormat: { 
            numberFormat: { type: 'CURRENCY', pattern: '"Rs" #,##0;[Red]-"Rs" #,##0' }, 
            horizontalAlignment: 'RIGHT', 
            textFormat: { foregroundColor: solid(navy), bold: true } 
          } 
        }, 
        fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat' 
      } 
    });

    // Out of Wallet Column formatting (I) - Red bold text
    requests.push({ 
      repeatCell: { 
        range: gridRange(id, 3, 1000, 8, 9), 
        cell: { 
          userEnteredFormat: { 
            numberFormat: { type: 'CURRENCY', pattern: '"Rs" #,##0;[Red]-"Rs" #,##0' }, 
            horizontalAlignment: 'RIGHT', 
            textFormat: { foregroundColor: solid('#D93025'), bold: true } 
          } 
        }, 
        fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat' 
      } 
    });

    // Lend Money Date & Time formatting (Col N) - Blue text
    requests.push({ 
      repeatCell: { 
        range: gridRange(id, 3, 1000, 13, 14), 
        cell: { 
          userEnteredFormat: { 
            horizontalAlignment: 'CENTER', 
            textFormat: { foregroundColor: solid('#1D4ED8') } 
          } 
        }, 
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat' 
      } 
    });

    // Lend Money Amount formatting (Col O) - Green bold text
    requests.push({ 
      repeatCell: { 
        range: gridRange(id, 3, 1000, 14, 15), 
        cell: { 
          userEnteredFormat: { 
            numberFormat: { type: 'CURRENCY', pattern: '"Rs" #,##0;[Red]-"Rs" #,##0' }, 
            horizontalAlignment: 'RIGHT', 
            textFormat: { foregroundColor: solid('#008000'), bold: true } 
          } 
        }, 
        fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat' 
      } 
    });
  }

  if (lendBorrow) {
    const id = lendBorrow.sheetId;
    requests.push({ updateSheetProperties: { properties: { sheetId: id, tabColor: solid('#6366F1'), gridProperties: { frozenRowCount: 1, hideGridlines: false } }, fields: 'tabColor,gridProperties.frozenRowCount,gridProperties.hideGridlines' } });
    setFill(gridRange(id, 0, 1, 0, 9), navy, { textFormat: { foregroundColor: solid('#FFFFFF'), bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' });
    setFill(gridRange(id, 1, 500, 0, 9), '#FFFFFF', { textFormat: { foregroundColor: solid('#334155'), fontSize: 10 }, verticalAlignment: 'MIDDLE' });
    requests.push({ updateDimensionProperties: { range: { sheetId: id, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } });
    [150, 165, 145, 240, 125, 105, 115, 110, 140].forEach((size, index) => width(id, index, size));
  }

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const fullDesignError = await res.text();
    console.warn('Full Sheet design could not be applied; using the compatible design pass.', fullDesignError);
    try {
      await applyCoreSheetDesign(accessToken, spreadsheetId, sheets);
      return;
    } catch (fallbackError: any) {
      throw parseGoogleApiError(res.status, fullDesignError, fallbackError?.message || 'Failed to apply the new spreadsheet design');
    }
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
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A2:J1000`,
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

  const parsedTransactions: Transaction[] = [];

  rows.forEach((row, idx) => {
    if (!row || row.length === 0) return;
    const col0 = String(row[0] || '').trim();
    const col1 = String(row[1] || '').trim();
    const col2 = String(row[2] || '').trim();
    const col3 = String(row[3] || '').trim();

    // Skip table headers and date group rows (where col1/time is empty or col2 is date text)
    if (col0 === 'Date' || col0 === 'Transaction ID' || (!col1 && !col2) || col2 === 'Date') return;

    // Check if new format (col2 is IN or OUT) vs legacy format (col3 is type)
    let type: Transaction['type'] = 'cash_expense';
    let dateStr = col0;
    let timeStr = col1;
    let categoryStr = col3;
    let amountRaw = row[4];
    let noteStr = String(row[5] || '');
    let paymentMethodStr = String(row[6] || 'Cash');

    if (col2 === 'IN') {
      type = 'cash_added';
    } else if (col2 === 'OUT') {
      type = paymentMethodStr === 'Card' ? 'card_expense' : 'cash_expense';
    } else if (['cash_added', 'cash_expense', 'card_expense'].includes(col3)) {
      // Legacy format
      dateStr = String(row[1] || '');
      timeStr = String(row[2] || '');
      type = col3 as any;
      categoryStr = String(row[4] || 'Other');
      amountRaw = row[5];
      paymentMethodStr = String(row[6] || 'Cash');
      noteStr = String(row[7] || '');
    } else {
      return;
    }

    const amount = parseFloat(String(amountRaw || '0').replace(/[^0-9.-]+/g, '')) || 0;
    if (amount <= 0 && !categoryStr) return;

    parsedTransactions.push({
      id: col0.startsWith('tx_') ? col0 : `tx_sheet_${idx}_${Date.now()}`,
      date: dateStr,
      time: timeStr,
      type,
      category: categoryStr || 'Other',
      amount,
      paymentMethod: paymentMethodStr || 'Cash',
      notes: noteStr,
      createdAt: Date.now() - idx * 1000,
    });
  });

  return parsedTransactions;
};

export const overwriteTransactionsInSheet = async (
  accessToken: string,
  spreadsheetId: string,
  transactions: Transaction[],
  lendItems: LendItem[] = []
) => {
  // Clear existing transactions & lend side table range
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A4:P1000:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (transactions.length === 0 && lendItems.length === 0) return;

  // Sort transactions chronologically to compute running balance
  const sortedTxs = [...transactions].sort((a, b) => a.createdAt - b.createdAt);

  // Group transactions by Date string
  const grouped: { [date: string]: Transaction[] } = {};
  sortedTxs.forEach((tx) => {
    const d = tx.date || 'Today';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(tx);
  });

  let runningBalance = 0;
  const gridRows: any[][] = [];

  Object.entries(grouped).forEach(([dateStr, txList]) => {
    // Insert Date Header row matching user's screenshot layout
    gridRows.push(['', '', dateStr, '', '', '', '', '', '', '', '', '', '', '', '', '']);

    txList.forEach((tx) => {
      const isIN = tx.type === 'cash_added';
      const typeStr = isIN ? 'IN' : 'OUT';
      
      let outOfWalletStr = '';
      if (isIN) {
        runningBalance += tx.amount;
      } else {
        if (runningBalance >= tx.amount) {
          runningBalance -= tx.amount;
        } else {
          const deficit = tx.amount - runningBalance;
          runningBalance = 0;
          outOfWalletStr = `Rs -${deficit.toLocaleString()}`;
        }
      }

      const cardPaymentStr = tx.type === 'card_expense' || tx.paymentMethod === 'Card' ? `Rs ${tx.amount.toLocaleString()}` : '';
      const balanceStr = `Rs ${runningBalance.toLocaleString()}`;

      gridRows.push([
        tx.date,
        tx.time || '',
        typeStr,
        tx.category,
        tx.amount,
        tx.notes || '',
        tx.paymentMethod || 'Cash',
        balanceStr,
        outOfWalletStr,
        cardPaymentStr,
        '', '', '', '', '', ''
      ]);
    });
  });

  // Populate Lend Money table in columns N, O, P starting at row 4 (index 0 of gridRows or merged)
  lendItems.forEach((lend, index) => {
    const timeDisplay = lend.date ? `${lend.date}` : '';
    const dateAndTime = timeDisplay ? `${timeDisplay}` : 'N/A';
    const amountStr = `Rs ${lend.amount.toLocaleString()}`;
    const personReason = lend.personName + (lend.thingsOrReason ? ` ${lend.thingsOrReason}` : '');

    if (index < gridRows.length) {
      gridRows[index][13] = dateAndTime;
      gridRows[index][14] = amountStr;
      gridRows[index][15] = personReason;
    } else {
      gridRows.push([
        '', '', '', '', '', '', '', '', '', '', '', '', '',
        dateAndTime,
        amountStr,
        personReason
      ]);
    }
  });

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A4?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: gridRows,
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

export const fetchAllLendItemsFromSheet = async (
  accessToken: string,
  spreadsheetId: string
): Promise<LendItem[]> => {
  try {
    // First try fetching from Transactions side table N4:P500
    const sideRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!N4:P500`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (sideRes.ok) {
      const sideData = await sideRes.json();
      const sideRows: any[][] = sideData.values || [];
      const sideLends = sideRows
        .filter((row) => row && row[0] && row[1])
        .map((row, idx) => ({
          id: `lend_side_${idx}_${Date.now()}`,
          personName: String(row[2] || '').split(' ')[0] || 'Lend Person',
          type: 'lent' as const,
          thingsOrReason: String(row[2] || ''),
          amount: parseFloat(String(row[1] || '0').replace(/[^0-9.-]+/g, '')) || 0,
          date: String(row[0] || ''),
          status: 'pending' as const,
          createdAt: Date.now(),
        }));

      if (sideLends.length > 0) return sideLends;
    }

    // Fallback to Lend_Borrow tab
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Lend_Borrow!A2:I500`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const rows: any[][] = data.values || [];

    return rows
      .filter((row) => row && row[0] && row[1])
      .map((row) => ({
        id: String(row[0]),
        personName: String(row[1] || ''),
        type: row[2] === 'I Borrowed' ? 'borrowed' : 'lent',
        thingsOrReason: String(row[3] || ''),
        amount: parseFloat(String(row[4] || '0').replace(/[^0-9.-]+/g, '')) || 0,
        date: String(row[5] || ''),
        dueDate: String(row[6] || ''),
        status: (row[7] as any) === 'returned' ? 'returned' : 'pending',
        phone: String(row[8] || ''),
        createdAt: Date.now(),
      }));
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
