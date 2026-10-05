import { Transaction, SpendingSummary, CategorySummary, LendItem, TransactionType, LendType, LendStatus } from '../types/finance';
import { signInWithGoogleWorkspace, getCachedWorkspaceToken, setCachedWorkspaceToken } from './workspaceAuth';
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
            rowCount: 42,
            columnCount: 14,
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

    // Palette aligned with SpendDesk Dashboard (navy + brand green)
    const softNavy = { red: 19 / 255, green: 31 / 255, blue: 43 / 255 }; // #131F2B
    const white = { red: 1, green: 1, blue: 1 };
    const greenText = { red: 15 / 255, green: 138 / 255, blue: 95 / 255 }; // #0F8A5F
    const greenBg = { red: 240 / 255, green: 250 / 255, blue: 245 / 255 }; // #F0FAF5
    const redText = { red: 194 / 255, green: 51 / 255, blue: 77 / 255 }; // #C2334D
    const redBg = { red: 252 / 255, green: 232 / 255, blue: 230 / 255 }; // #fce8e6
    const blueText = { red: 37 / 255, green: 99 / 255, blue: 235 / 255 }; // #2563eb
    const lightGreyBorder = { red: 226 / 255, green: 232 / 255, blue: 240 / 255 }; // #E2E8F0
    const dateBannerBg = { red: 240 / 255, green: 250 / 255, blue: 245 / 255 }; // #F0FAF5
    const dateBannerText = { red: 17 / 255, green: 107 / 255, blue: 78 / 255 }; // #116B4E
    const spacerBg = { red: 244 / 255, green: 246 / 255, blue: 248 / 255 }; // #F4F6F8
    const lendHeaderBg = { red: 180 / 255, green: 83 / 255, blue: 9 / 255 }; // #B45309
    const lendSubBg = { red: 255 / 255, green: 247 / 255, blue: 237 / 255 }; // #FFF7ED
    const lendSubText = { red: 154 / 255, green: 52 / 255, blue: 18 / 255 }; // #9A3412
    const zebraBg = { red: 250 / 255, green: 251 / 255, blue: 252 / 255 }; // #FAFBFC

    const requests: any[] = [
      // 1. Column Widths (A to P)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } }, // Col A Date
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } }, // Col B Time
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 60 }, fields: 'pixelSize' } }, // Col C Type
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } }, // Col D Category
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } }, // Col E Amount
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } }, // Col F Note
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } }, // Col G Payment Method
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 105 }, fields: 'pixelSize' } }, // Col H Balance
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } }, // Col I Thin Gap (22px)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 105 }, fields: 'pixelSize' } }, // Col J Out of Wallet
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }, properties: { pixelSize: 105 }, fields: 'pixelSize' } }, // Col K Card Payment (adjacent to J!)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 11, endIndex: 12 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } }, // Col L Spacer before Lend (28px)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 105 }, fields: 'pixelSize' } }, // Col M Lend Date
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } }, // Col N Lend Person
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } }, // Col O Lend Reason
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 15, endIndex: 16 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } }, // Col P Lend Amount

      // 2. Format Row 1 Header A1:H1 with soft navy
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: softNavy,
              textFormat: { foregroundColor: white, bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      // 3. Spacer Col I on Row 1
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 8, endColumnIndex: 9 },
          cell: {
            userEnteredFormat: {
              backgroundColor: spacerBg,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // 4. Col J & K Row 1 Headers (Out of Wallet & Card Payment - NO GAP between them!) with soft navy
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 9, endColumnIndex: 11 },
          cell: {
            userEnteredFormat: {
              backgroundColor: softNavy,
              textFormat: { foregroundColor: white, bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      // 5. Spacer Col L on Row 1
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 11, endColumnIndex: 12 },
          cell: {
            userEnteredFormat: {
              backgroundColor: spacerBg,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // 6. Format & Merge LEND MONEY header over M1:P1 — warm amber (distinct from main ledger)
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
              backgroundColor: lendHeaderBg,
              textFormat: { foregroundColor: white, bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      // 7. Format Row 2 Subheaders for Lend Money M2:P2 (Date, Person, Reason, Amount)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 12, endColumnIndex: 16 },
          cell: {
            userEnteredFormat: {
              backgroundColor: lendSubBg,
              textFormat: { foregroundColor: lendSubText, bold: true, fontSize: 9 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      // Also tint Row 2 spacers + blank main header cells for a clean frozen band
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: softNavy,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 8, endColumnIndex: 9 },
          cell: {
            userEnteredFormat: {
              backgroundColor: spacerBg,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 9, endColumnIndex: 11 },
          cell: {
            userEnteredFormat: {
              backgroundColor: softNavy,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 11, endColumnIndex: 12 },
          cell: {
            userEnteredFormat: {
              backgroundColor: spacerBg,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // 8. Freeze top 2 rows
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: {
              frozenRowCount: 2,
            },
          },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      // 9. Clean up any data validations
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 3000, startColumnIndex: 2, endColumnIndex: 3 },
          rule: undefined,
        },
      },
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 3000, startColumnIndex: 6, endColumnIndex: 7 },
          rule: undefined,
        },
      },
      // 10. Base Alignment & Fonts for Date and Time
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 0, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: blueText },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // 11. Right alignment for Amount, Balance
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 4, endColumnIndex: 5 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 7, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: blueText },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // 12. Out of Wallet (Col J) and Card Payment (Col K) right-aligned
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
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 10, endColumnIndex: 11 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: blueText },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // 13. Lend Money data column styling: Date (Col M, index 12), Person (Col N, index 13), Reason (Col O, index 14), Amount (Col P, index 15)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 12, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: blueText },
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
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 15, endColumnIndex: 16 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: blueText },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // 14. Subtle light borders across rows and columns
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

    // Format specific date banner rows: STOPS AT CARD PAYMENT COLUMN (Col K, endColumnIndex: 11)!
    if (dateRowIndices && dateRowIndices.length > 0) {
      dateRowIndices.forEach((rIdx) => {
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 0, endColumnIndex: 11 },
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

    // Conditional formatting
    const existingRules = txSheet?.conditionalFormats || [];
    if (existingRules.length === 0) {
      requests.push(
        // Subtle zebra striping for readability (skips header rows via formula on row 3+)
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 0, endColumnIndex: 16 }],
              booleanRule: {
                condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=AND(ISEVEN(ROW()),$A3<>"")' }] },
                format: { backgroundColor: zebraBg },
              },
            },
            index: 0,
          },
        },
        // Rule: Type IN -> Green text & soft green pill background
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 2, endColumnIndex: 3 }],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'IN' }] },
                format: { backgroundColor: greenBg, textFormat: { foregroundColor: greenText, bold: true } },
              },
            },
            index: 1,
          },
        },
        // Rule: Type OUT -> Red text & soft red pill background
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 2, endColumnIndex: 3 }],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'OUT' }] },
                format: { backgroundColor: redBg, textFormat: { foregroundColor: redText, bold: true } },
              },
            },
            index: 2,
          },
        },
        // Rule: Amount for IN -> Green bold text
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 4, endColumnIndex: 5 }],
              booleanRule: {
                condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$C3="IN"' }] },
                format: { textFormat: { foregroundColor: greenText, bold: true } },
              },
            },
            index: 3,
          },
        },
        // Rule: Amount for OUT -> Red bold text
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 4, endColumnIndex: 5 }],
              booleanRule: {
                condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$C3="OUT"' }] },
                format: { textFormat: { foregroundColor: redText, bold: true } },
              },
            },
            index: 4,
          },
        },
        // Rule: Payment Method Cash -> Green text & soft green background
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 6, endColumnIndex: 7 }],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Cash' }] },
                format: { backgroundColor: greenBg, textFormat: { foregroundColor: greenText } },
              },
            },
            index: 5,
          },
        },
        // Rule: Out of Wallet (Col J) -> Soft red background & red bold text
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 9, endColumnIndex: 10 }],
              booleanRule: {
                condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$J3<>""' }] },
                format: { backgroundColor: redBg, textFormat: { foregroundColor: redText, bold: true } },
              },
            },
            index: 6,
          },
        }
      );
    }

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

const CHUNK_SIZE = 90;

const postSheetBatchUpdate = async (
  accessToken: string,
  spreadsheetId: string,
  requests: any[]
) => {
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
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`Dashboard!${cells.range}`)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    const row: any[] = data.values?.[0] || [];
    // C=period, D=merge empty, E=FROM label, F=from date, G=TO label, H–I=to date
    const period = normalizeDashboardPeriod(row[0]) as DashboardPeriod;
    const startDate = parseSheetDateCell(row[3], '');
    const endDate = parseSheetDateCell(row[5] ?? row[6], '');
    return { period, startDate, endDate };
  } catch (e) {
    console.warn('Dashboard filter read notice:', e);
    return fallback;
  }
};

/**
 * Rebuilds the whole Dashboard tab (values + formatting) via chunked batchUpdates.
 * The layout comes from `buildDashboardLayout` (src/lib/dashboardSheet.ts), which is
 * the single source of truth for both what is written and how it is styled.
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

  const requests = layout.buildRequests(sheetId, {
    rowCount: grid.rowCount || 1000,
    columnCount: grid.columnCount || 26,
  });

  await postSheetBatchUpdate(accessToken, spreadsheetId, requests);

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
