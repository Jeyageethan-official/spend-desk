import { Transaction, SpendingSummary, CategorySummary, LendItem, TransactionType, LendType, LendStatus } from '../types/finance';
import { signInWithGoogleWorkspace, getCachedWorkspaceToken, setCachedWorkspaceToken } from './workspaceAuth';
import { sortTransactionsChronological, calculateRunningBalances } from './calculations';
import { loadDeletedTxIds } from './storage';

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
            rowCount: 45,
            columnCount: 16,
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

    // 10% Darker Corporate Navy (#1F3A64) per user request
    const softNavy = { red: 31 / 255, green: 58 / 255, blue: 100 / 255 }; // #1F3A64 (10% darker)
    const white = { red: 1, green: 1, blue: 1 };
    const greenText = { red: 13 / 255, green: 115 / 255, blue: 55 / 255 }; // #0d7337
    const greenBg = { red: 230 / 255, green: 244 / 255, blue: 234 / 255 }; // #e6f4ea
    const redText = { red: 197 / 255, green: 34 / 255, blue: 31 / 255 }; // #c5221f
    const redBg = { red: 252 / 255, green: 232 / 255, blue: 230 / 255 }; // #fce8e6
    const blueText = { red: 37 / 255, green: 99 / 255, blue: 235 / 255 }; // #2563eb
    const lightGreyBorder = { red: 229 / 255, green: 231 / 255, blue: 235 / 255 }; // #e5e7eb
    const lightBlueRowBg = { red: 235 / 255, green: 243 / 255, blue: 254 / 255 }; // #ebf3fe
    const spacerBg = { red: 248 / 255, green: 249 / 255, blue: 250 / 255 }; // #f8f9fa

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
      // 6. Format & Merge LEND MONEY header over M1:P1 (columns 12 to 16) with soft navy
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
              backgroundColor: softNavy,
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
              backgroundColor: softNavy,
              textFormat: { foregroundColor: white, bold: true, fontSize: 9 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
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
                backgroundColor: lightBlueRowBg,
                textFormat: { foregroundColor: softNavy, bold: true, fontSize: 10 },
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
            index: 0,
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
            index: 1,
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
            index: 2,
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
            index: 3,
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
            index: 4,
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
            index: 5,
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

export const applyDashboardSheetDesign = async (
  accessToken: string,
  spreadsheetId: string
) => {
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties,charts)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!metaRes.ok) return;
    const metaData = await metaRes.json();
    const dashSheet = metaData.sheets?.find((s: any) => s.properties?.title === 'Dashboard');
    if (!dashSheet) return;
    const sheetId = dashSheet.properties.sheetId;

    // 10% Darker Corporate Navy (#1F3A64) & Modern Executive Palette
    const darkNavy = { red: 31 / 255, green: 58 / 255, blue: 100 / 255 }; // #1F3A64 (10% darker)
    const darkNavyText = { red: 22 / 255, green: 42 / 255, blue: 74 / 255 }; // #162A4A
    const canvasBg = { red: 248 / 255, green: 249 / 255, blue: 250 / 255 }; // #F8F9FA
    const white = { red: 1, green: 1, blue: 1 };
    const subtleBorder = { red: 226 / 255, green: 232 / 255, blue: 240 / 255 }; // #E2E8F0
    const headerPillBg = { red: 241 / 255, green: 245 / 255, blue: 249 / 255 }; // #F1F5F9
    const zebraBg = { red: 249 / 255, green: 250 / 255, blue: 251 / 255 }; // #F9FAFB

    // Unique standout color for CURRENT BALANCE card:
    const balanceBg = { red: 236 / 255, green: 253 / 255, blue: 245 / 255 }; // #ECFDF5 Soft Emerald
    const balanceBorder = { red: 134 / 255, green: 239 / 255, blue: 172 / 255 }; // #86EFAC Emerald Border
    const balanceDark = { red: 22 / 255, green: 101 / 255, blue: 52 / 255 }; // #166534 Forest Green
    const balanceText = { red: 5 / 255, green: 150 / 255, blue: 105 / 255 }; // #059669 Vibrant Emerald

    const mutedLabel = { red: 100 / 255, green: 116 / 255, blue: 139 / 255 }; // #64748B
    const darkText = { red: 15 / 255, green: 23 / 255, blue: 42 / 255 }; // #0F172A
    const roseText = { red: 225 / 255, green: 29 / 255, blue: 72 / 255 }; // #E11D48
    const blueText = { red: 37 / 255, green: 99 / 255, blue: 235 / 255 }; // #2563EB
    const redText = { red: 220 / 255, green: 38 / 255, blue: 38 / 255 }; // #DC2626

    const requests: any[] = [
      // 1. Remove raw gridlines across entire Dashboard sheet
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: {
              showGridlines: false,
              rowCount: 45,
              columnCount: 16,
            },
          },
          fields: 'gridProperties(showGridlines,rowCount,columnCount)',
        },
      },
      // 2. Fill canvas A1:N45 with light background (#F8F9FA) so cards pop
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 45, startColumnIndex: 0, endColumnIndex: 14 },
          cell: {
            userEnteredFormat: {
              backgroundColor: canvasBg,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // 3. Row Heights for generous professional whitespace
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 15 }, fields: 'pixelSize' } }, // Row 1 margin
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 38 }, fields: 'pixelSize' } }, // Row 2 Header
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } }, // Row 3 Subtitle
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 10 }, fields: 'pixelSize' } }, // Row 4 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } }, // Row 5 Controls 1
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } }, // Row 6 Controls 2
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 12 }, fields: 'pixelSize' } }, // Row 7 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } }, // Row 8 Hero Balance Top
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 48 }, fields: 'pixelSize' } }, // Row 9 Hero Balance Big
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 14 }, fields: 'pixelSize' } }, // Row 10 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 10, endIndex: 11 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } }, // Row 11 5 KPI Labels
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 11, endIndex: 12 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } }, // Row 12 5 KPI Values
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 16 }, fields: 'pixelSize' } }, // Row 13 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } }, // Row 14 Section titles
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } }, // Row 15 Table headers
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 15, endIndex: 22 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } }, // Rows 16-22 Data rows
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 22, endIndex: 23 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } }, // Row 23 Total rows
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 23, endIndex: 24 }, properties: { pixelSize: 16 }, fields: 'pixelSize' } }, // Row 24 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 24, endIndex: 25 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } }, // Row 25 Chart titles
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 25, endIndex: 37 }, properties: { pixelSize: 25 }, fields: 'pixelSize' } }, // Rows 26-37 Chart area

      // 4. Column Widths
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Col A margin
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } }, // Col B Category
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 60 }, fields: 'pixelSize' } }, // Col C Count
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } }, // Col D Amount
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } }, // Col E Share %
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 75 }, fields: 'pixelSize' } }, // Col F Bar 1
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 75 }, fields: 'pixelSize' } }, // Col G Bar 2
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } }, // Col H Day
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } }, // Col I Activity
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } }, // Col J Amount
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // Col K Trend
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 11, endIndex: 12 }, properties: { pixelSize: 75 }, fields: 'pixelSize' } }, // Col L Bar 1
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 75 }, fields: 'pixelSize' } }, // Col M Bar 2
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Col N margin

      // 5. Header: Two separate rows merged and centered with 10% darker navy
      { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: darkNavy, bold: true, fontSize: 16 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: mutedLabel, bold: false, fontSize: 10 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },

      // 6. Top Control Panels (Rows 5 & 6):
      // Left Panel: Filter & Date Range (Cols B to G)
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } }, // B5:C5
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 3, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } }, // D5:G5 (Clickable Dropdown!)
      { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } }, // B6:C6
      { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 3, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } }, // D6:G6
      // Right Panel: Sync Status & Last Updated (Cols H to M)
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 7, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } }, // H5:I5
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 9, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // J5:M5
      { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 7, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } }, // H6:I6
      { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 9, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // J6:M6

      // Format Control Labels (B5:C6 and H5:I6)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerPillBg,
              textFormat: { foregroundColor: darkNavy, bold: true, fontSize: 9 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 7, endColumnIndex: 9 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerPillBg,
              textFormat: { foregroundColor: darkNavy, bold: true, fontSize: 9 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      // Format Control Values (D5:G6 and J5:M6)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 3, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              backgroundColor: white,
              textFormat: { foregroundColor: darkNavyText, bold: true, fontSize: 9 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 9, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: white,
              textFormat: { foregroundColor: darkNavyText, bold: false, fontSize: 9 },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      // Borders for Control Panels
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 7 },
          top: { style: 'SOLID', color: subtleBorder },
          bottom: { style: 'SOLID', color: subtleBorder },
          left: { style: 'SOLID', color: subtleBorder },
          right: { style: 'SOLID', color: subtleBorder },
          innerHorizontal: { style: 'SOLID', color: subtleBorder },
          innerVertical: { style: 'SOLID', color: subtleBorder },
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 7, endColumnIndex: 13 },
          top: { style: 'SOLID', color: subtleBorder },
          bottom: { style: 'SOLID', color: subtleBorder },
          left: { style: 'SOLID', color: subtleBorder },
          right: { style: 'SOLID', color: subtleBorder },
          innerHorizontal: { style: 'SOLID', color: subtleBorder },
          innerVertical: { style: 'SOLID', color: subtleBorder },
        },
      },

      // 7. Interactive Dropdown Data Validation on Period Filter (D5:G5)
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 3, endColumnIndex: 7 },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'ALL TIME' },
                { userEnteredValue: 'TODAY' },
                { userEnteredValue: 'THIS WEEK' },
                { userEnteredValue: 'THIS MONTH' },
                { userEnteredValue: 'CUSTOM' },
              ],
            },
            showCustomUi: true,
            strict: false,
          },
        },
      },

      // 8. HERO CARD: CURRENT BALANCE (ON ITS OWN LINE - Rows 8 & 9!)
      // Top row of Hero Card (Row 8): Title on left, subtitle on right
      { mergeCells: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } }, // B8:G8
      { mergeCells: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 7, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // H8:M8
      // Bottom row of Hero Card (Row 9): Badge on left, BIG BALANCE on right
      { mergeCells: { range: { sheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 1, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } }, // B9:F9
      { mergeCells: { range: { sheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 5, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // F9:M9

      // Hero Card Styling (Unique Emerald Background #ECFDF5 with Forest Green text)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              backgroundColor: balanceBg,
              textFormat: { foregroundColor: balanceDark, bold: true, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 7, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: balanceBg,
              textFormat: { foregroundColor: balanceText, bold: false, fontSize: 9 },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 1, endColumnIndex: 6 },
          cell: {
            userEnteredFormat: {
              backgroundColor: balanceBg,
              textFormat: { foregroundColor: balanceDark, bold: true, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 5, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: balanceBg,
              textFormat: { foregroundColor: balanceText, bold: true, fontSize: 18 },
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0.00' },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment)',
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 7, endRowIndex: 9, startColumnIndex: 1, endColumnIndex: 13 },
          top: { style: 'SOLID', color: balanceBorder },
          bottom: { style: 'SOLID', color: balanceBorder },
          left: { style: 'SOLID', color: balanceBorder },
          right: { style: 'SOLID', color: balanceBorder },
        },
      },

      // 9. OTHER 5 KPI CARDS ON THE NEXT LINE (Rows 11 & 12!)
      // Card 1: + CASH ADDED (Cols B-C)
      { mergeCells: { range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
      // Card 2: - CASH SPENT (Cols D-E)
      { mergeCells: { range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 3, endColumnIndex: 5 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 3, endColumnIndex: 5 }, mergeType: 'MERGE_ALL' } },
      // Card 3: CARD SPENT (Cols F-G)
      { mergeCells: { range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 5, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 5, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
      // Card 4: TOTAL SPENT (Cols H-J)
      { mergeCells: { range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 7, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 7, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' } },
      // Card 5: OUT OF WALLET (Cols K-M)
      { mergeCells: { range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 10, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 10, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },

      // Style 5 KPI Cards:
      ...[
        { startCol: 1, endCol: 3, valColor: balanceText }, // Cash Added
        { startCol: 3, endCol: 5, valColor: roseText }, // Cash Spent
        { startCol: 5, endCol: 7, valColor: blueText }, // Card Spent
        { startCol: 7, endCol: 10, valColor: darkText }, // Total Spent
        { startCol: 10, endCol: 13, valColor: redText }, // Out of Wallet
      ].flatMap((card) => [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: card.startCol, endColumnIndex: card.endCol },
            cell: {
              userEnteredFormat: {
                backgroundColor: white,
                textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 8 },
                horizontalAlignment: 'LEFT',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: card.startCol, endColumnIndex: card.endCol },
            cell: {
              userEnteredFormat: {
                backgroundColor: white,
                textFormat: { foregroundColor: card.valColor, bold: true, fontSize: 14 },
                numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0.00' },
                horizontalAlignment: 'RIGHT',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment)',
          },
        },
        {
          updateBorders: {
            range: { sheetId, startRowIndex: 10, endRowIndex: 12, startColumnIndex: card.startCol, endColumnIndex: card.endCol },
            top: { style: 'SOLID', color: subtleBorder },
            bottom: { style: 'SOLID', color: subtleBorder },
            left: { style: 'SOLID', color: subtleBorder },
            right: { style: 'SOLID', color: subtleBorder },
          },
        },
      ]),

      // 10. Section Headers (Row 14)
      { mergeCells: { range: { sheetId, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 7, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: darkNavy, bold: true, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },

      // 11. Table Column Headers (Row 15)
      { mergeCells: { range: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 5, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } }, // Progress Bar Col F-G
      { mergeCells: { range: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 11, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // Progress Bar Col L-M
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerPillBg,
              textFormat: { foregroundColor: darkNavy, bold: true, fontSize: 9 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },

      // 12. Data Rows (Rows 16-22): Alternating white & light zebra rows + merge visual sparkline cells
      ...[15, 16, 17, 18, 19, 20, 21].flatMap((rIdx) => [
        { mergeCells: { range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 5, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
        { mergeCells: { range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 11, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 1, endColumnIndex: 13 },
            cell: {
              userEnteredFormat: {
                backgroundColor: rIdx % 2 === 1 ? white : zebraBg,
                textFormat: { foregroundColor: darkText, fontSize: 9 },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
      ]),

      // 13. Column Alignments & Number Formats
      // Counts (Col C, Col index 2) -> Center aligned
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 15, endRowIndex: 22, startColumnIndex: 2, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
              numberFormat: { type: 'NUMBER', pattern: '#,##0' },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,numberFormat)',
        },
      },
      // Category Amount (Col D, Col index 3) -> Currency right-aligned
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 15, endRowIndex: 23, startColumnIndex: 3, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0.00' },
              textFormat: { bold: true },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,numberFormat,textFormat)',
        },
      },
      // Category Share % (Col E, Col index 4) -> Percentage centered
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 15, endRowIndex: 23, startColumnIndex: 4, endColumnIndex: 5 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
              numberFormat: { type: 'PERCENT', pattern: '0.0%' },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,numberFormat)',
        },
      },
      // Day Activity & Trend (Col I & Col K) -> Centered
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 15, endRowIndex: 22, startColumnIndex: 8, endColumnIndex: 9 },
          cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 15, endRowIndex: 22, startColumnIndex: 10, endColumnIndex: 11 },
          cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      },
      // Daily Amount (Col J, Col index 9) -> Currency right-aligned
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 15, endRowIndex: 23, startColumnIndex: 9, endColumnIndex: 10 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0.00' },
              textFormat: { bold: true },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,numberFormat,textFormat)',
        },
      },

      // 14. Total Rows (Row 23)
      { mergeCells: { range: { sheetId, startRowIndex: 22, endRowIndex: 23, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 22, endRowIndex: 23, startColumnIndex: 5, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 22, endRowIndex: 23, startColumnIndex: 7, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 22, endRowIndex: 23, startColumnIndex: 11, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 22, endRowIndex: 23, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerPillBg,
              textFormat: { foregroundColor: darkNavy, bold: true, fontSize: 9 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },

      // 15. Clean borders for both tables
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 14, endRowIndex: 23, startColumnIndex: 1, endColumnIndex: 7 },
          top: { style: 'SOLID', color: subtleBorder },
          bottom: { style: 'SOLID', color: subtleBorder },
          left: { style: 'SOLID', color: subtleBorder },
          right: { style: 'SOLID', color: subtleBorder },
          innerHorizontal: { style: 'SOLID', color: subtleBorder },
          innerVertical: { style: 'SOLID', color: subtleBorder },
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 14, endRowIndex: 23, startColumnIndex: 7, endColumnIndex: 13 },
          top: { style: 'SOLID', color: subtleBorder },
          bottom: { style: 'SOLID', color: subtleBorder },
          left: { style: 'SOLID', color: subtleBorder },
          right: { style: 'SOLID', color: subtleBorder },
          innerHorizontal: { style: 'SOLID', color: subtleBorder },
          innerVertical: { style: 'SOLID', color: subtleBorder },
        },
      },

      // 16. Chart Section Titles (Row 25)
      { mergeCells: { range: { sheetId, startRowIndex: 24, endRowIndex: 25, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 24, endRowIndex: 25, startColumnIndex: 7, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 24, endRowIndex: 25, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: darkNavy, bold: true, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
    ];

    // Batch Update 1: Apply layout, formatting, hero cards, borders, dropdowns
    const formatRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!formatRes.ok) {
      console.warn('Dashboard format update notice:', await formatRes.text());
    }

    // Batch Update 2: Embedded Google Sheets API Charts (Anchored under tables at Row 26)
    try {
      const chartRequests: any[] = [];

      // Clear existing charts first to avoid duplicates
      if (dashSheet.charts && dashSheet.charts.length > 0) {
        dashSheet.charts.forEach((c: any) => {
          if (c?.chartId !== undefined) {
            chartRequests.push({
              deleteEmbeddedObject: {
                objectId: c.chartId,
              },
            });
          }
        });
      }

      // Chart 1: Category Expense Breakdown (Pie/Donut Chart over Cols B-G, Rows 26-37)
      chartRequests.push({
        addChart: {
          chart: {
            spec: {
              title: 'Category Expense Breakdown',
              titleTextFormat: {
                foregroundColor: darkNavy,
                fontSize: 11,
                bold: true,
              },
              backgroundColor: white,
              pieChart: {
                legendPosition: 'RIGHT_LEGEND',
                pieHole: 0.45,
                domain: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId,
                        startRowIndex: 14,
                        endRowIndex: 22,
                        startColumnIndex: 1,
                        endColumnIndex: 2,
                      },
                    ],
                  },
                },
                series: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId,
                        startRowIndex: 14,
                        endRowIndex: 22,
                        startColumnIndex: 3,
                        endColumnIndex: 4,
                      },
                    ],
                  },
                },
              },
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId,
                  rowIndex: 25,
                  columnIndex: 1,
                },
                widthPixels: 490,
                heightPixels: 270,
              },
            },
          },
        },
      });

      // Chart 2: 7-Day Spending Comparison (Column Chart over Cols H-M, Rows 26-37)
      chartRequests.push({
        addChart: {
          chart: {
            spec: {
              title: '7-Day Daily Spending Comparison',
              titleTextFormat: {
                foregroundColor: darkNavy,
                fontSize: 11,
                bold: true,
              },
              backgroundColor: white,
              basicChart: {
                chartType: 'COLUMN',
                legendPosition: 'NO_LEGEND',
                headerCount: 1,
                axis: [
                  { position: 'BOTTOM_AXIS', title: 'Day' },
                  { position: 'LEFT_AXIS', title: 'Amount (Rs)' },
                ],
                domains: [
                  {
                    domain: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId,
                            startRowIndex: 14,
                            endRowIndex: 22,
                            startColumnIndex: 7,
                            endColumnIndex: 8,
                          },
                        ],
                      },
                    },
                  },
                ],
                series: [
                  {
                    series: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId,
                            startRowIndex: 14,
                            endRowIndex: 22,
                            startColumnIndex: 9,
                            endColumnIndex: 10,
                          },
                        ],
                      },
                    },
                    targetAxis: 'LEFT_AXIS',
                  },
                ],
              },
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId,
                  rowIndex: 25,
                  columnIndex: 7,
                },
                widthPixels: 490,
                heightPixels: 270,
              },
            },
          },
        },
      });

      const chartRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: chartRequests }),
      });

      if (!chartRes.ok) {
        console.warn('Dashboard embedded chart notice:', await chartRes.text());
      }
    } catch (chartErr) {
      console.warn('Chart creation notice:', chartErr);
    }
  } catch (e) {
    console.warn('Dashboard sheet formatting notice:', e);
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
  dailySpend: { [day: string]: number }
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
            requests: [{ addSheet: { properties: { title: 'Dashboard', gridProperties: { rowCount: 45, columnCount: 16 } } } }],
          }),
        });
      }
    }
  } catch (e) {
    console.warn('Dashboard existence check notice:', e);
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const catFood = categories.find((c) => c.category === 'Food') || { amount: 0, count: 0 };
  const catTransport = categories.find((c) => c.category === 'Transport') || { amount: 0, count: 0 };
  const catShopping = categories.find((c) => c.category === 'Shopping') || { amount: 0, count: 0 };
  const catBills = categories.find((c) => c.category === 'Bills') || { amount: 0, count: 0 };
  const catEnt = categories.find((c) => c.category === 'Entertainment') || { amount: 0, count: 0 };
  const catEdu = categories.find((c) => c.category === 'Education') || { amount: 0, count: 0 };
  const catOther = categories.find((c) => c.category === 'Other') || { amount: 0, count: 0 };

  // Complete Dashboard values matrix (Rows 1 to 25, Cols A to M)
  const dashboardValues = [
    // Row 1 (margin)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 2: SPEND DESK Heading (Merged B2:M2)
    ['', 'SPEND DESK', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 3: Subtitle (Merged B3:M3)
    ['', 'Executive Financial Dashboard • Real-time Sync & Cash Management', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 4 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 5: Top Control Row 1 (Period Filter with interactive dropdown on left, Sync Status on right)
    [
      '',
      '🔍 PERIOD FILTER', '', 'ALL TIME', '', '', '',
      '🟢 SYNC STATUS', '', 'Connected & Real-Time Active', '', '', '',
    ],
    // Row 6: Top Control Row 2 (Date Range on left, Last Synced on right)
    [
      '',
      '📅 DATE RANGE', '', 'Live Synced (All Records)', '', '', '',
      '🕒 LAST SYNCED', '', `${dateStr} at ${timeStr}`, '', '', '',
    ],
    // Row 7 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 8: HERO CARD - CURRENT BALANCE (ON ITS OWN LINE! UNIQUE COLOR!)
    [
      '',
      '💰 CURRENT CASH BALANCE', '', '', '', '', '',
      'Live Liquid Wallet Funds • Available for Daily Spending', '', '', '', '', '',
    ],
    // Row 9: Hero Card Value
    [
      '',
      '● In-Hand Available Cash', '', '', '',
      summary.currentCashBalance, '', '', '', '', '', '', '',
    ],
    // Row 10 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 11: 5 KPI Cards on the NEXT LINE!
    [
      '',
      '+ CASH ADDED', '',
      '- CASH SPENT', '',
      '💳 CARD SPENT', '',
      '🔥 TOTAL SPENT', '', '',
      '⚠️ OUT OF WALLET', '', '',
    ],
    // Row 12: 5 KPI Card Values
    [
      '',
      summary.cashAdded, '',
      summary.cashSpent, '',
      summary.cardSpend, '',
      summary.totalSpend, '', '',
      summary.outOfWallet, '', '',
    ],
    // Row 13 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 14: Section Titles
    [
      '',
      '📊 SPENDING BY CATEGORY & SHARE', '', '', '', '', '',
      '📈 DAILY SPENDING TREND & ACTIVITY', '', '', '', '', '',
    ],
    // Row 15: Table Headers
    [
      '',
      'Category', 'Count', 'Amount', 'Share %', 'Visual Progress Bar', '',
      'Day', 'Activity', 'Amount', 'Trend', 'Visual Daily Spend Bar', '',
    ],
    // Row 16 (Food / Mon)
    [
      '',
      'Food', catFood.count, catFood.amount, '=IF($D$23>0, D16/$D$23, 0)',
      '=IF(D16>0, SPARKLINE(D16, {"charttype","bar";"max",MAX(D$16:D$22)+1;"color1","#1F3A64"}), "—")', '',
      'Mon', 'Weekday', dailySpend['Mon'] || 0,
      '=IF(J16>AVERAGE(J$16:J$22),"Above Avg","Normal")',
      '=IF(J16>0, SPARKLINE(J16, {"charttype","bar";"max",MAX(J$16:J$22)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 17 (Transport / Tue)
    [
      '',
      'Transport', catTransport.count, catTransport.amount, '=IF($D$23>0, D17/$D$23, 0)',
      '=IF(D17>0, SPARKLINE(D17, {"charttype","bar";"max",MAX(D$16:D$22)+1;"color1","#1F3A64"}), "—")', '',
      'Tue', 'Weekday', dailySpend['Tue'] || 0,
      '=IF(J17>AVERAGE(J$16:J$22),"Above Avg","Normal")',
      '=IF(J17>0, SPARKLINE(J17, {"charttype","bar";"max",MAX(J$16:J$22)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 18 (Shopping / Wed)
    [
      '',
      'Shopping', catShopping.count, catShopping.amount, '=IF($D$23>0, D18/$D$23, 0)',
      '=IF(D18>0, SPARKLINE(D18, {"charttype","bar";"max",MAX(D$16:D$22)+1;"color1","#1F3A64"}), "—")', '',
      'Wed', 'Weekday', dailySpend['Wed'] || 0,
      '=IF(J18>AVERAGE(J$16:J$22),"Above Avg","Normal")',
      '=IF(J18>0, SPARKLINE(J18, {"charttype","bar";"max",MAX(J$16:J$22)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 19 (Bills / Thu)
    [
      '',
      'Bills', catBills.count, catBills.amount, '=IF($D$23>0, D19/$D$23, 0)',
      '=IF(D19>0, SPARKLINE(D19, {"charttype","bar";"max",MAX(D$16:D$22)+1;"color1","#1F3A64"}), "—")', '',
      'Thu', 'Weekday', dailySpend['Thu'] || 0,
      '=IF(J19>AVERAGE(J$16:J$22),"Above Avg","Normal")',
      '=IF(J19>0, SPARKLINE(J19, {"charttype","bar";"max",MAX(J$16:J$22)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 20 (Entertainment / Fri)
    [
      '',
      'Entertainment', catEnt.count, catEnt.amount, '=IF($D$23>0, D20/$D$23, 0)',
      '=IF(D20>0, SPARKLINE(D20, {"charttype","bar";"max",MAX(D$16:D$22)+1;"color1","#1F3A64"}), "—")', '',
      'Fri', 'Weekday', dailySpend['Fri'] || 0,
      '=IF(J20>AVERAGE(J$16:J$22),"Above Avg","Normal")',
      '=IF(J20>0, SPARKLINE(J20, {"charttype","bar";"max",MAX(J$16:J$22)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 21 (Education / Sat)
    [
      '',
      'Education', catEdu.count, catEdu.amount, '=IF($D$23>0, D21/$D$23, 0)',
      '=IF(D21>0, SPARKLINE(D21, {"charttype","bar";"max",MAX(D$16:D$22)+1;"color1","#1F3A64"}), "—")', '',
      'Sat', 'Weekend', dailySpend['Sat'] || 0,
      '=IF(J21>AVERAGE(J$16:J$22),"Above Avg","Normal")',
      '=IF(J21>0, SPARKLINE(J21, {"charttype","bar";"max",MAX(J$16:J$22)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 22 (Other / Sun)
    [
      '',
      'Other', catOther.count, catOther.amount, '=IF($D$23>0, D22/$D$23, 0)',
      '=IF(D22>0, SPARKLINE(D22, {"charttype","bar";"max",MAX(D$16:D$22)+1;"color1","#1F3A64"}), "—")', '',
      'Sun', 'Weekend', dailySpend['Sun'] || 0,
      '=IF(J22>AVERAGE(J$16:J$22),"Above Avg","Normal")',
      '=IF(J22>0, SPARKLINE(J22, {"charttype","bar";"max",MAX(J$16:J$22)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 23: Total Rows with live formulas and mini in-cell visual column sparklines
    [
      '',
      'Total Spent', '', '=SUM(D16:D22)', '100.0%',
      '=SPARKLINE(D16:D22, {"charttype","column";"color","#1F3A64"})', '',
      'Total 7-Day Spend', '', '=SUM(J16:J22)', 'Weekly Trend',
      '=SPARKLINE(J16:J22, {"charttype","column";"color","#2563EB"})', '',
    ],
    // Row 24 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 25: Chart Section Headers
    [
      '',
      '🍩 CATEGORY BREAKDOWN VISUAL CHART', '', '', '', '', '',
      '📊 7-DAY SPENDING COMPARISON CHART', '', '', '', '', '',
    ],
  ];

  // Write full dashboard grid
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Dashboard!A1:M25?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: dashboardValues }),
    }
  );
  if (!res.ok) {
    console.warn('Dashboard values sync notice:', await res.text());
  }

  // Ensure full layout, gridline removal, hero card styling, dropdowns, and charts are applied on every sync!
  await applyDashboardSheetDesign(accessToken, spreadsheetId);
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
