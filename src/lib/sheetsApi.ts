import { Transaction, SpendingSummary, CategorySummary, LendItem, TransactionType, LendType, LendStatus } from '../types/finance';
import { 
  signInWithGoogleWorkspace, 
  getCachedWorkspaceToken, 
  setCachedWorkspaceToken,
  isGoogleTokenExpired,
  refreshGoogleTokenSilently,
  GOOGLE_SCOPES 
} from './workspaceAuth';
import { sortTransactionsChronological, calculateRunningBalances } from './calculations';
import { loadDeletedTxIds } from './storage';
import {
  buildDashboardLayout,
  DashboardFilterState,
  DashboardLayout,
  DashboardPeriod,
  getDashboardFilterCells,
  normalizeDashboardPeriod,
  parseSheetDateCell,
} from './dashboardSheet';

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
 * Executes a Google API fetch call with automatic silent token refresh on expiry or 401.
 * Seamlessly preserves user session and prevents unauthenticated errors.
 */
export const fetchGoogleWithAutoRefresh = async (
  url: string,
  options: RequestInit = {},
  fallbackToken?: string
): Promise<Response> => {
  let token = fallbackToken || getCachedWorkspaceToken();

  // If token is missing, expired, or a Supabase JWT (starts with eyJ), silently refresh first
  if (!token || token.startsWith('eyJ') || isGoogleTokenExpired()) {
    try {
      const fresh = await refreshGoogleTokenSilently();
      if (fresh) token = fresh;
    } catch {}
  }

  const exec = (authToken: string | null) =>
    fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${authToken || ''}`,
      },
    });

  let res = await exec(token);

  if (res.status === 401) {
    // Attempt silent refresh and retry once
    try {
      const refreshed = await refreshGoogleTokenSilently();
      if (refreshed && refreshed !== token) {
        token = refreshed;
        res = await exec(refreshed);
      }
    } catch {}
  }

  return res;
};

/**
 * Single Google OAuth Access Token Request.
 * Uses official Workspace OAuth integration flow.
 */
export const requestGoogleAccessToken = async (promptUser = true): Promise<string> => {
  const existing = getStoredAccessToken();
  if (existing && existing !== 'local_token' && !existing.startsWith('eyJ') && existing.length > 20) {
    if (!isGoogleTokenExpired()) {
      return existing;
    }
  }

  // If token is expired or missing, try silent refresh first
  try {
    const silentlyRefreshed = await refreshGoogleTokenSilently();
    if (silentlyRefreshed) return silentlyRefreshed;
  } catch {}

  // In background or silent mode, never invoke interactive popup
  if (!promptUser) {
    return existing || '';
  }

  // Unified single sign-in flow (opens exactly one Google account chooser popup)
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

  if (status === 401 || message.includes('UNAUTHENTICATED') || message.includes('invalid authentication credentials') || message.includes('OAuth 2 access token')) {
    return new Error('Google session expired. Tap "Connect Google" to refresh access.');
  }

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
            rowCount: 60,
            columnCount: 20,
          },
        },
      },
      {
        properties: {
          title: 'Transactions',
          gridProperties: {
            rowCount: 1000,
            columnCount: 16,
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

export const applyTransactionsSheetDesign = async (
  accessToken: string,
  spreadsheetId: string,
  dateRowIndices?: number[]
) => {
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties,conditionalFormats)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!metaRes.ok) return;
    const metaData = await metaRes.json();
    const txSheet = metaData.sheets?.find((s: any) => s.properties?.title === 'Transactions') || metaData.sheets?.[0];
    const sheetId = txSheet?.properties?.sheetId ?? 0;

    // Ledger palette: navy headers, ocean body text (#005975), soft red/green highlights
    const headerNavy = { red: 31 / 255, green: 58 / 255, blue: 100 / 255 }; // #1F3A64 headers only
    const ocean = { red: 0 / 255, green: 89 / 255, blue: 117 / 255 }; // #005975 body + dates
    const white = { red: 1, green: 1, blue: 1 };
    const pageWhite = { red: 1, green: 1, blue: 1 };
    const greenText = { red: 21 / 255, green: 128 / 255, blue: 61 / 255 }; // #15803D
    const greenBg = { red: 245 / 255, green: 254 / 255, blue: 249 / 255 }; // #F5FEF9 very light green
    const redText = { red: 185 / 255, green: 28 / 255, blue: 28 / 255 }; // #B91C1C
    const redBg = { red: 255 / 255, green: 250 / 255, blue: 250 / 255 }; // #FFFAFA very light red
    const cardText = { red: 0 / 255, green: 89 / 255, blue: 117 / 255 }; // ocean for card/bank rows
    const cardBg = { red: 232 / 255, green: 244 / 255, blue: 248 / 255 }; // #E8F4F8 light ocean
    const lightGreyBorder = { red: 226 / 255, green: 232 / 255, blue: 240 / 255 }; // #E2E8F0
    const dateBannerBg = { red: 232 / 255, green: 244 / 255, blue: 248 / 255 }; // #E8F4F8 soft date band
    const dateBannerText = { red: 27 / 255, green: 58 / 255, blue: 107 / 255 }; // #1B3A6B daily date banner text
    const spacerBg = { red: 248 / 255, green: 250 / 255, blue: 252 / 255 }; // #F8FAFC

    const requests: any[] = [
      // Column widths A–P
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 105 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 105 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }, properties: { pixelSize: 105 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 11, endIndex: 12 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 105 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 15, endIndex: 16 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },

      // Row 1 headers A–H
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerNavy,
              textFormat: { foregroundColor: white, bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },
      // Spacer Col I row 1
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 8, endColumnIndex: 9 },
          cell: { userEnteredFormat: { backgroundColor: spacerBg } },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // Row 1 headers J–K
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 9, endColumnIndex: 11 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerNavy,
              textFormat: { foregroundColor: white, bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },
      // Spacer Col L row 1
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 11, endColumnIndex: 12 },
          cell: { userEnteredFormat: { backgroundColor: spacerBg } },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // LEND MONEY header M1:P1
      {
        mergeCells: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 12, endColumnIndex: 16 },
          mergeType: 'MERGE_ALL',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 12, endColumnIndex: 16 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerNavy,
              textFormat: { foregroundColor: white, bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },

      // CLEAR the black bar on row 2 for main ledger (A–L) — keep only lend subheaders navy
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 12 },
          cell: {
            userEnteredFormat: {
              backgroundColor: pageWhite,
              textFormat: { foregroundColor: ocean, bold: false, fontSize: 9 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
      // Lend subheaders M2:P2 only
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 12, endColumnIndex: 16 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerNavy,
              textFormat: { foregroundColor: white, bold: true, fontSize: 9 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },

      // Freeze top 2 rows
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 2 } },
          fields: 'gridProperties.frozenRowCount',
        },
      },

      // Reset ALL data-area backgrounds to white first so old date-blue never bleeds onto other rows
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 0, endColumnIndex: 16 },
          cell: {
            userEnteredFormat: {
              backgroundColor: pageWhite,
              textFormat: { foregroundColor: ocean, bold: false },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },

      // Category → ocean text, LEFT aligned (date banner rows re-center this cell afterwards)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 3, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: ocean },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 5, endColumnIndex: 6 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: ocean },
            },
          },
          fields: 'userEnteredFormat(textFormat)',
        },
      },

      // Date + Time → #005975, centered
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 0, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: ocean },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // Type → centered
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 2, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
        },
      },
      // Amount right
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 4, endColumnIndex: 5 },
          cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      },
      // Payment Method → centered
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 6, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
        },
      },
      // Balance → ocean, right
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 7, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: ocean },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // Out of Wallet
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 9, endColumnIndex: 10 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: redText, bold: true },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // Card Payment amounts → ocean
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 10, endColumnIndex: 11 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: ocean },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // Lend block — dates #005975, other fields ocean
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 12, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: ocean },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 13, endColumnIndex: 15 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: ocean },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 15, endColumnIndex: 16 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: ocean },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // Light borders
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 3000, startColumnIndex: 0, endColumnIndex: 16 },
          top: { style: 'SOLID', color: lightGreyBorder },
          bottom: { style: 'SOLID', color: lightGreyBorder },
          left: { style: 'SOLID', color: lightGreyBorder },
          right: { style: 'SOLID', color: lightGreyBorder },
          innerHorizontal: { style: 'SOLID', color: lightGreyBorder },
          innerVertical: { style: 'SOLID', color: lightGreyBorder },
        },
      },
    ];

    // Date banner rows — ONLY main ledger A–H (not Out of Wallet / Card Payment / Lend)
    if (dateRowIndices && dateRowIndices.length > 0) {
      dateRowIndices.forEach((rIdx) => {
        if (rIdx < 2) return;
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 0, endColumnIndex: 8 },
            cell: {
              userEnteredFormat: {
                backgroundColor: dateBannerBg,
                textFormat: { foregroundColor: dateBannerText, bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        });
      });
    }

    // Replace ALL conditional formats so OUT / Cash / Card rules always refresh
    const existingRules = txSheet?.conditionalFormats || [];
    for (let i = existingRules.length - 1; i >= 0; i--) {
      requests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
    }

    const cfRules = [
      // Type IN
      {
        ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 2, endColumnIndex: 3 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=TRIM($C3)="IN"' }] },
          format: { backgroundColor: greenBg, textFormat: { foregroundColor: greenText, bold: true } },
        },
      },
      // Type OUT
      {
        ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 2, endColumnIndex: 3 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=TRIM($C3)="OUT"' }] },
          format: { backgroundColor: redBg, textFormat: { foregroundColor: redText, bold: true } },
        },
      },
      // Amount IN
      {
        ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 4, endColumnIndex: 5 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=TRIM($C3)="IN"' }] },
          format: { textFormat: { foregroundColor: greenText, bold: true } },
        },
      },
      // Amount OUT
      {
        ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 4, endColumnIndex: 5 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=TRIM($C3)="OUT"' }] },
          format: { textFormat: { foregroundColor: redText, bold: true } },
        },
      },
      // Payment Cash → darker green
      {
        ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 6, endColumnIndex: 7 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=LOWER(TRIM($G3))="cash"' }] },
          format: { backgroundColor: greenBg, textFormat: { foregroundColor: greenText, bold: true } },
        },
      },
      // Payment Card / Bank → darker blue
      {
        ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 6, endColumnIndex: 7 }],
        booleanRule: {
          condition: {
            type: 'CUSTOM_FORMULA',
            values: [{ userEnteredValue: '=OR(LOWER(TRIM($G3))="card",REGEXMATCH(LOWER(TRIM($G3)),"bank|transfer"))' }],
          },
          format: { backgroundColor: cardBg, textFormat: { foregroundColor: cardText, bold: true } },
        },
      },
      // Out of Wallet filled
      {
        ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 9, endColumnIndex: 10 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$J3<>""' }] },
          format: { backgroundColor: redBg, textFormat: { foregroundColor: redText, bold: true } },
        },
      },
    ];

    cfRules.forEach((rule, index) => {
      requests.push({ addConditionalFormatRule: { rule, index } });
    });

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
  } catch (e) {
    console.warn('Sheet formatting notice:', e);
  }
};

const CHUNK_SIZE = 80;

const postSheetBatchUpdate = async (
  accessToken: string,
  spreadsheetId: string,
  requests: any[]
) => {
  if (!requests.length) return;
  for (let i = 0; i < requests.length; i += CHUNK_SIZE) {
    const chunk = requests.slice(i, i + CHUNK_SIZE);
    const formatRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: chunk }),
    });
    if (!formatRes.ok) {
      const detail = await formatRes.text();
      throw parseGoogleApiError(formatRes.status, detail, 'Failed to rebuild Google Sheet Dashboard');
    }
  }
};

/** Read Period / From / To from the Dashboard filter bar so sync preserves user choices. */
export const readDashboardFilter = async (
  accessToken: string,
  spreadsheetId: string
): Promise<DashboardFilterState> => {
  const fallback: DashboardFilterState = { period: 'All time', startDate: '', endDate: '' };
  try {
    const cells = getDashboardFilterCells();
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?` +
        `ranges=${encodeURIComponent(`Dashboard!${cells.period}`)}` +
        `&ranges=${encodeURIComponent(`Dashboard!${cells.from}`)}` +
        `&ranges=${encodeURIComponent(`Dashboard!${cells.to}`)}` +
        `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    const pick = (idx: number) => data.valueRanges?.[idx]?.values?.[0]?.[0];
    const period = normalizeDashboardPeriod(pick(0)) as DashboardPeriod;
    const startDate = parseSheetDateCell(pick(1), '');
    const endDate = parseSheetDateCell(pick(2), '');
    return { period, startDate, endDate };
  } catch (e) {
    console.warn('Dashboard filter read notice:', e);
    return fallback;
  }
};

/**
 * Rebuilds the whole Dashboard tab (values + formatting) in safe phases.
 * Resize/wipe run before merges/formats so a format failure cannot leave a half-wiped tab
 * without values — and Transactions sync can no longer succeed while Dashboard silently dies.
 */
export const applyDashboardSheetDesign = async (
  accessToken: string,
  spreadsheetId: string,
  layout: DashboardLayout
) => {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties,charts)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!metaRes.ok) {
    throw parseGoogleApiError(metaRes.status, await metaRes.text(), 'Failed to load Dashboard sheet metadata');
  }
  const metaData = await metaRes.json();
  const dashSheet = metaData.sheets?.find((s: any) => s.properties?.title === 'Dashboard');
  if (!dashSheet) {
    throw new Error('Dashboard tab not found in Google Sheet');
  }
  const sheetId = dashSheet.properties.sheetId;
  const grid = dashSheet.properties.gridProperties || {};

  const phases = layout.buildRequestPhases
    ? layout.buildRequestPhases(sheetId, {
        rowCount: grid.rowCount || 1000,
        columnCount: grid.columnCount || 26,
      })
    : [layout.buildRequests(sheetId, {
        rowCount: grid.rowCount || 1000,
        columnCount: grid.columnCount || 26,
      })];

  for (const phase of phases) {
    await postSheetBatchUpdate(accessToken, spreadsheetId, phase);
  }

  // Clean up any embedded charts left on the Dashboard so the layout stays clean
  if (dashSheet.charts && dashSheet.charts.length > 0) {
    const deleteRequests = dashSheet.charts
      .filter((c: any) => c?.chartId !== undefined)
      .map((c: any) => ({
        deleteEmbeddedObject: {
          objectId: c.chartId,
        },
      }));

    if (deleteRequests.length > 0) {
      await postSheetBatchUpdate(accessToken, spreadsheetId, deleteRequests).catch(console.warn);
    }
  }
};

export const initializeSheetLayout = async (accessToken: string, spreadsheetId: string) => {
  // Set up Transactions headers:
  // Row 1: Date, Time, Type, Category, Amount, Note, Payment Method, Balance, [Spacer], Out of Wallet, Card Payment, [Spacer], LEND MONEY (merged)
  // Row 2: Subheaders for Lend Money: Date, Person, Reason, Amount
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
        '', // Col I: thin spacer gap (22px)
        'Out of Wallet', // Col J
        'Card Payment', // Col K (immediately next to Out of Wallet!)
        '', // Col L: spacer before Lend Money (28px)
        'LEND MONEY', // Col M
        '', // Col N
        '', // Col O
        '', // Col P
      ],
      [
        '', '', '', '', '', '', '', '', '', '', '', '',
        'Date', // Col M
        'Person', // Col N
        'Reason', // Col O
        'Amount', // Col P
      ],
    ],
  };

  const txHeaderResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A1:P2?valueInputOption=USER_ENTERED`,
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

  // Apply transactions design
  await applyTransactionsSheetDesign(accessToken, spreadsheetId);

  // Remove leftover Lend_Borrow tab if present (lend lives in Transactions M–P)
  try {
    await removeLendBorrowSheetIfPresent(accessToken, spreadsheetId);
  } catch (e) {
    console.warn('Lend_Borrow cleanup notice:', e);
  }

  // Initialize and style Dashboard with live layout
  await syncDashboardStats(
    accessToken,
    spreadsheetId,
    { currentCashBalance: 0, cashAdded: 0, cashSpent: 0, cardSpend: 0, totalSpend: 0, outOfWallet: 0 },
    [
      { category: 'Food', amount: 0, count: 0, percentage: 0, color: '#f59e0b', iconName: 'Utensils' },
      { category: 'Transport', amount: 0, count: 0, percentage: 0, color: '#3b82f6', iconName: 'Car' },
      { category: 'Shopping', amount: 0, count: 0, percentage: 0, color: '#ec4899', iconName: 'ShoppingBag' },
      { category: 'Bills', amount: 0, count: 0, percentage: 0, color: '#ef4444', iconName: 'Zap' },
      { category: 'Entertainment', amount: 0, count: 0, percentage: 0, color: '#8b5cf6', iconName: 'Film' },
      { category: 'Education', amount: 0, count: 0, percentage: 0, color: '#10b981', iconName: 'GraduationCap' },
      { category: 'Other', amount: 0, count: 0, percentage: 0, color: '#64748b', iconName: 'MoreHorizontal' },
    ],
    { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 }
  );
};

export const syncDashboardStats = async (
  accessToken: string,
  spreadsheetId: string,
  summary: SpendingSummary,
  categories: CategorySummary[],
  dailySpend: { [day: string]: number },
  recentTransactions?: Transaction[],
  lendItems?: LendItem[]
) => {
  // Ensure Dashboard tab exists in sheet metadata
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const hasDash = meta.sheets?.some((s: any) => s.properties?.title === 'Dashboard');
      if (!hasDash) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{ addSheet: { properties: { title: 'Dashboard', gridProperties: { rowCount: 60, columnCount: 20 } } } }],
          }),
        });
      }
    }
  } catch (e) {
    console.warn('Dashboard existence check notice:', e);
  }

  // Preserve Period / From / To the user set on the Dashboard filter bar.
  const filter = await readDashboardFilter(accessToken, spreadsheetId);

  // Build one layout (values + design together) and rebuild the tab atomically.
  const layout = buildDashboardLayout({
    summary,
    categories,
    dailySpend,
    transactions: recentTransactions,
    lendItems,
    filter,
  });
  await applyDashboardSheetDesign(accessToken, spreadsheetId, layout);
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
  spreadsheetId: string,
  emailScope?: string
): Promise<Transaction[]> => {
  const res = await fetchGoogleWithAutoRefresh(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A1:Z2000`,
    {},
    accessToken
  );

  if (!res.ok) {
    const error = await res.text();
    throw parseGoogleApiError(res.status, error, 'Failed to fetch transactions');
  }

  const deletedIds = loadDeletedTxIds(emailScope);
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
      const cleanTime = String(row[timeCol] || '').replace(/[^0-9]/g, '');
      const cleanNote = notes.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
      rawId = `tx_sheet_${dateStr}_${cleanTime}_${Math.round(amount)}_${cleanNote}`;
    }

    if (deletedIds.has(rawId)) {
      return; // Never re-import deleted transactions!
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

export const formatDateToSheetHeader = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parts[2].padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${day} ${months[monthIdx]} ${year}`;
      }
    }
    const d = new Date(dateStr + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
  } catch {}
  return dateStr;
};

export const tryParseDateHeader = (raw: string): string | null => {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const monthStr = match[2].toLowerCase();
    const year = match[3];
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = months.indexOf(monthStr);
    if (mIdx >= 0) {
      const month = String(mIdx + 1).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return null;
};

export const formatLendDateTime = (item: LendItem): string => {
  if (!item.date) return '';
  return formatDateToSheetHeader(item.date);
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
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A3:P5000:clear`,
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
  const safeLends = [...(lendItems || [])];

  // Group transactions chronologically by date
  const txsByDate = new Map<string, Transaction[]>();
  sorted.forEach((tx) => {
    const d = tx.date || '';
    if (!txsByDate.has(d)) txsByDate.set(d, []);
    txsByDate.get(d)!.push(tx);
  });

  const rows: any[][] = [];
  const dateRowIndices: number[] = [];
  let lendIdx = 0;

  txsByDate.forEach((dayTxs, dateStr) => {
    const dateHeader = formatDateToSheetHeader(dateStr);

    // Side lend column for the date banner row if available (Date, Person, Reason, Amount)
    const lendBanner = lendIdx < safeLends.length ? safeLends[lendIdx++] : null;
    const lendBannerCols = lendBanner
      ? [
          formatLendDateTime(lendBanner),
          lendBanner.personName || '',
          lendBanner.thingsOrReason || '',
          lendBanner.amount,
        ]
      : ['', '', '', ''];

    // Track 0-indexed row position for light blue date row styling in Google Sheets (starts at row 3 = index 2)
    dateRowIndices.push(rows.length + 2);

    // Date header banner row: Col D has bold centered date; stops at Card Payment Col K
    rows.push([
      '', '', '', dateHeader, '', '', '', '', '', '', '', '',
      ...lendBannerCols,
    ]);

    // Data rows for transactions on this date
    dayTxs.forEach((tx) => {
      const rb = runningBalances.get(tx.id);
      const bal = rb ? rb.balance : 0;
      const oow = rb ? rb.outOfWallet : 0;
      const isCard = tx.paymentMethod === 'Card' || tx.paymentMethod === 'Bank Transfer' || tx.type === 'card_expense';
      const isCashIn = tx.type === 'cash_added';

      const nextLend = lendIdx < safeLends.length ? safeLends[lendIdx++] : null;
      const nextLendCols = nextLend
        ? [
            formatLendDateTime(nextLend),
            nextLend.personName || '',
            nextLend.thingsOrReason || '',
            nextLend.amount,
          ]
        : ['', '', '', ''];

      rows.push([
        tx.date || '', // Col A (0)
        tx.time || '', // Col B (1)
        isCashIn ? 'IN' : 'OUT', // Col C (2)
        tx.category || (isCashIn ? 'Cash Added' : 'Other'), // Col D (3)
        tx.amount, // Col E (4)
        tx.notes || '', // Col F (5)
        tx.paymentMethod || 'Cash', // Col G (6)
        bal, // Col H (7)
        '', // Col I: thin spacer gap (22px) (8)
        oow > 0 ? oow : '', // Col J: Out of Wallet (9)
        isCard ? tx.amount : '', // Col K: Card Payment (10) - immediately next to J!
        '', // Col L: spacer before Lend (28px) (11)
        ...nextLendCols, // Col M: Date, Col N: Person, Col O: Reason, Col P: Amount (12-15)
      ]);
    });
  });

  // If there are still lend items after placing all transactions:
  while (lendIdx < safeLends.length) {
    const remainingLend = safeLends[lendIdx++];
    rows.push([
      '', '', '', '', '', '', '', '', '', '', '', '',
      formatLendDateTime(remainingLend),
      remainingLend.personName || '',
      remainingLend.thingsOrReason || '',
      remainingLend.amount,
    ]);
  }

  const endRow = rows.length + 2; // Rows start at row 3
  const targetRange = `Transactions!A3:P${endRow}`;

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

  // Ensure header styling and merged columns are applied
  await applyTransactionsSheetDesign(accessToken, spreadsheetId, dateRowIndices);
};

/** Ensure a named tab exists (creates it when missing). */
/** Delete the unused Lend_Borrow tab when present. Lend data stays on Transactions (M–P). */
export const removeLendBorrowSheetIfPresent = async (
  accessToken: string,
  spreadsheetId: string
): Promise<void> => {
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    const lendSheet = meta.sheets?.find((s: any) => s.properties?.title === 'Lend_Borrow');
    if (!lendSheet?.properties?.sheetId && lendSheet?.properties?.sheetId !== 0) return;

    // Never delete if it's the only sheet left
    if ((meta.sheets?.length || 0) <= 1) return;

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ deleteSheet: { sheetId: lendSheet.properties.sheetId } }],
      }),
    });
  } catch (e) {
    console.warn('Could not remove Lend_Borrow sheet:', e);
  }
};

/** @deprecated Lend data is written into Transactions columns M–P. Kept as a no-op cleanup. */
export const overwriteLendItemsInSheet = async (
  accessToken: string,
  spreadsheetId: string,
  _lendItems: LendItem[] = []
) => {
  await removeLendBorrowSheetIfPresent(accessToken, spreadsheetId);
};

export const ensureNamedSheet = async (
  accessToken: string,
  spreadsheetId: string,
  title: string,
  gridProperties: { rowCount?: number; columnCount?: number } = {}
): Promise<void> => {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) {
    throw parseGoogleApiError(metaRes.status, await metaRes.text(), `Failed to check for ${title} sheet`);
  }
  const meta = await metaRes.json();
  const exists = meta.sheets?.some((s: any) => s.properties?.title === title);
  if (exists) return;

  const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        addSheet: {
          properties: {
            title,
            gridProperties: {
              rowCount: gridProperties.rowCount ?? 500,
              columnCount: gridProperties.columnCount ?? 10,
            },
          },
        },
      }],
    }),
  });
  if (!addRes.ok) {
    throw parseGoogleApiError(addRes.status, await addRes.text(), `Failed to create ${title} sheet`);
  }
};

export const fetchAllLendItemsFromSheet = async (
  accessToken: string,
  spreadsheetId: string
): Promise<LendItem[]> => {
  try {
    const res = await fetchGoogleWithAutoRefresh(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Lend_Borrow!A1:I500`,
      {},
      accessToken
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
