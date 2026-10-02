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

    // Visual Palette exactly matching the SpendDesk HTML prototype
    const pageBg = { red: 244 / 255, green: 246 / 255, blue: 248 / 255 }; // #f4f6f8
    const cardBg = { red: 1, green: 1, blue: 1 }; // #ffffff
    const cardBorder = { red: 224 / 255, green: 230 / 255, blue: 235 / 255 }; // #e0e6eb
    const balanceBorder = { red: 217 / 255, green: 233 / 255, blue: 225 / 255 }; // #d9e9e1
    const navyText = { red: 23 / 255, green: 34 / 255, blue: 49 / 255 }; // #172231
    const mutedLabel = { red: 125 / 255, green: 137 / 255, blue: 150 / 255 }; // #7d8996
    const subtext = { red: 154 / 255, green: 164 / 255, blue: 174 / 255 }; // #9aa4ae
    const sectionLabel = { red: 111 / 255, green: 123 / 255, blue: 136 / 255 }; // #6f7b88
    const balanceGreen = { red: 25 / 255, green: 110 / 255, blue: 75 / 255 }; // #196e4b
    const syncBg = { red: 238 / 255, green: 248 / 255, blue: 243 / 255 }; // #eef8f3
    const syncBorder = { red: 214 / 255, green: 238 / 255, blue: 225 / 255 }; // #d6eee1
    const syncText = { red: 40 / 255, green: 116 / 255, blue: 81 / 255 }; // #287451
    const headerBorder = { red: 230 / 255, green: 234 / 255, blue: 238 / 255 }; // #e6eaee
    const rowDivider = { red: 237 / 255, green: 240 / 255, blue: 243 / 255 }; // #edf0f3
    const pendingAmber = { red: 155 / 255, green: 107 / 255, blue: 21 / 255 }; // #9b6b15
    const overdueRed = { red: 178 / 255, green: 76 / 255, blue: 76 / 255 }; // #b24c4c
    const footerText = { red: 154 / 255, green: 163 / 255, blue: 173 / 255 }; // #9aa3ad

    const requests: any[] = [
      // 1. Hide ALL gridlines across entire Dashboard sheet
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: {
              showGridlines: false,
              rowCount: 42,
              columnCount: 14,
            },
          },
          fields: 'gridProperties(showGridlines,rowCount,columnCount)',
        },
      },
      // 2. Light gray page background (#f4f6f8) across entire working area
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 42, startColumnIndex: 0, endColumnIndex: 14 },
          cell: {
            userEnteredFormat: {
              backgroundColor: pageBg,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // 3. Row Heights matching the HTML prototype spacing
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 16 }, fields: 'pixelSize' } }, // Row 1 margin
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } }, // Row 2 Header
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Row 3 Subtitle
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 14 }, fields: 'pixelSize' } }, // Row 4 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } }, // Row 5 Controls label
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } }, // Row 6 Controls value
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Row 7 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } }, // Row 8 Overview Title
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Row 9 KPI Row 1 Label
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } }, // Row 10 KPI Row 1 Value
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 10, endIndex: 11 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } }, // Row 11 KPI Row 1 Subtext
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 11, endIndex: 12 }, properties: { pixelSize: 12 }, fields: 'pixelSize' } }, // Row 12 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Row 13 KPI Row 2 Label
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } }, // Row 14 KPI Row 2 Value
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } }, // Row 15 KPI Row 2 Subtext
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 15, endIndex: 16 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } }, // Row 16 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 16, endIndex: 17 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } }, // Row 17 Analysis Title
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 17, endIndex: 18 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } }, // Row 18 Panel Titles
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 18, endIndex: 19 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } }, // Row 19 Table Headers
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 19, endIndex: 26 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } }, // Rows 20-26 Table Rows
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 26, endIndex: 27 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } }, // Row 27 Total Row
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 27, endIndex: 28 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } }, // Row 28 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 28, endIndex: 29 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } }, // Row 29 Lend Title
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 29, endIndex: 30 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } }, // Row 30 Lend Row 1 Label
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 30, endIndex: 31 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } }, // Row 31 Lend Row 1 Value
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 31, endIndex: 32 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } }, // Row 32 Lend Row 1 Subtext
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 32, endIndex: 33 }, properties: { pixelSize: 10 }, fields: 'pixelSize' } }, // Row 33 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 33, endIndex: 34 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } }, // Row 34 Lend Row 2 Label
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 34, endIndex: 35 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } }, // Row 35 Lend Row 2 Value
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 35, endIndex: 36 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } }, // Row 36 spacer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 36, endIndex: 37 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Row 37 Footer
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 37, endIndex: 38 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Row 38 Bottom margin

      // 4. Column Widths (4 columns of 255px each = 1020px total)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Col A margin
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } }, // Col B
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // Col C
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // Col D
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } }, // Col E
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // Col F
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // Col G
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } }, // Col H
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // Col I
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // Col J
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } }, // Col K
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 11, endIndex: 12 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // Col L
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // Col M
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } }, // Col N margin

      // 5. Header: SPENDDESK + Date
      { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } }, // B2:H2
      { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 8, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // I2:M2
      { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } }, // B3:H3
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: navyText, bold: true, fontSize: 18 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 8, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: mutedLabel, bold: false, fontSize: 10 },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: mutedLabel, bold: false, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },

      // 6. Filter & Control Bar (Row 5 & 6)
      // Period Control (Cols B-D)
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } }, // B5:D5
      { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } }, // B6:D6
      // Date Range Control (Cols E-H)
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 4, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } }, // E5:H5
      { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 4, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } }, // E6:H6
      // Sync Status Pill (Cols K-M, Row 6)
      { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 10, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // K6:M6

      // Style Control Labels
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 8 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 4, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 8 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      // Style Control Values
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: navyText, bold: true, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 4, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: navyText, bold: true, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      // Style Sync Pill
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 10, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: syncBg,
              textFormat: { foregroundColor: syncText, bold: true, fontSize: 9 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },
      // Borders for Controls
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 4 },
          top: { style: 'SOLID', color: cardBorder },
          bottom: { style: 'SOLID', color: cardBorder },
          left: { style: 'SOLID', color: cardBorder },
          right: { style: 'SOLID', color: cardBorder },
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 4, endColumnIndex: 8 },
          top: { style: 'SOLID', color: cardBorder },
          bottom: { style: 'SOLID', color: cardBorder },
          left: { style: 'SOLID', color: cardBorder },
          right: { style: 'SOLID', color: cardBorder },
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 10, endColumnIndex: 13 },
          top: { style: 'SOLID', color: syncBorder },
          bottom: { style: 'SOLID', color: syncBorder },
          left: { style: 'SOLID', color: syncBorder },
          right: { style: 'SOLID', color: syncBorder },
        },
      },

      // Dropdown validation on Period (B6:D6)
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 4 },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'All Time' },
                { userEnteredValue: 'Today' },
                { userEnteredValue: 'This Week' },
                { userEnteredValue: 'This Month' },
                { userEnteredValue: 'Custom' },
              ],
            },
            showCustomUi: true,
            strict: false,
          },
        },
      },

      // 7. FINANCIAL OVERVIEW Section Title (Row 8)
      { mergeCells: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: sectionLabel, bold: true, fontSize: 9 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },

      // 8. EXACTLY 6 CARDS IN FINANCIAL OVERVIEW:
      // ROW 1: Cash Balance | Cash Added | Cash Spend | Card Spend (Rows 9-11)
      ...[
        { colStart: 1, colEnd: 4, isBalance: true }, // Cash Balance (Cols B-D)
        { colStart: 4, colEnd: 7, isBalance: false }, // Cash Added (Cols E-G)
        { colStart: 7, colEnd: 10, isBalance: false }, // Cash Spend (Cols H-J)
        { colStart: 10, colEnd: 13, isBalance: false }, // Card Spend (Cols K-M)
      ].flatMap((card) => [
        { mergeCells: { range: { sheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: card.colStart, endColumnIndex: card.colEnd }, mergeType: 'MERGE_ALL' } }, // Label
        { mergeCells: { range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: card.colStart, endColumnIndex: card.colEnd }, mergeType: 'MERGE_ALL' } }, // Value
        { mergeCells: { range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: card.colStart, endColumnIndex: card.colEnd }, mergeType: 'MERGE_ALL' } }, // Subtext
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: card.colStart, endColumnIndex: card.colEnd },
            cell: {
              userEnteredFormat: {
                backgroundColor: cardBg,
                textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 9 },
                horizontalAlignment: 'LEFT',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: card.colStart, endColumnIndex: card.colEnd },
            cell: {
              userEnteredFormat: {
                backgroundColor: cardBg,
                textFormat: { foregroundColor: card.isBalance ? balanceGreen : navyText, bold: true, fontSize: 18 },
                numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0' },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment,verticalAlignment)',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: card.colStart, endColumnIndex: card.colEnd },
            cell: {
              userEnteredFormat: {
                backgroundColor: cardBg,
                textFormat: { foregroundColor: subtext, bold: false, fontSize: 8 },
                horizontalAlignment: 'LEFT',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        {
          updateBorders: {
            range: { sheetId, startRowIndex: 8, endRowIndex: 11, startColumnIndex: card.colStart, endColumnIndex: card.colEnd },
            top: { style: 'SOLID', color: card.isBalance ? balanceBorder : cardBorder },
            bottom: { style: 'SOLID', color: card.isBalance ? balanceBorder : cardBorder },
            left: { style: 'SOLID', color: card.isBalance ? balanceBorder : cardBorder },
            right: { style: 'SOLID', color: card.isBalance ? balanceBorder : cardBorder },
          },
        },
      ]),

      // ROW 2: Total Spend | Out of Wallet (Rows 13-15)
      ...[
        { colStart: 1, colEnd: 4 }, // Total Spend (Cols B-D)
        { colStart: 4, colEnd: 7 }, // Out of Wallet (Cols E-G)
      ].flatMap((card) => [
        { mergeCells: { range: { sheetId, startRowIndex: 12, endRowIndex: 13, startColumnIndex: card.colStart, endColumnIndex: card.colEnd }, mergeType: 'MERGE_ALL' } },
        { mergeCells: { range: { sheetId, startRowIndex: 13, endRowIndex: 14, startColumnIndex: card.colStart, endColumnIndex: card.colEnd }, mergeType: 'MERGE_ALL' } },
        { mergeCells: { range: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: card.colStart, endColumnIndex: card.colEnd }, mergeType: 'MERGE_ALL' } },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 12, endRowIndex: 13, startColumnIndex: card.colStart, endColumnIndex: card.colEnd },
            cell: {
              userEnteredFormat: {
                backgroundColor: cardBg,
                textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 9 },
                horizontalAlignment: 'LEFT',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 13, endRowIndex: 14, startColumnIndex: card.colStart, endColumnIndex: card.colEnd },
            cell: {
              userEnteredFormat: {
                backgroundColor: cardBg, // Normal white card!
                textFormat: { foregroundColor: navyText, bold: true, fontSize: 18 },
                numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0' },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment,verticalAlignment)',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: card.colStart, endColumnIndex: card.colEnd },
            cell: {
              userEnteredFormat: {
                backgroundColor: cardBg,
                textFormat: { foregroundColor: subtext, bold: false, fontSize: 8 },
                horizontalAlignment: 'LEFT',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        {
          updateBorders: {
            range: { sheetId, startRowIndex: 12, endRowIndex: 15, startColumnIndex: card.colStart, endColumnIndex: card.colEnd },
            top: { style: 'SOLID', color: cardBorder },
            bottom: { style: 'SOLID', color: cardBorder },
            left: { style: 'SOLID', color: cardBorder },
            right: { style: 'SOLID', color: cardBorder },
          },
        },
      ]),

      // 9. SPENDING ANALYSIS Section Title (Row 17)
      { mergeCells: { range: { sheetId, startRowIndex: 16, endRowIndex: 17, startColumnIndex: 1, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 16, endRowIndex: 17, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: sectionLabel, bold: true, fontSize: 9 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },

      // 10. TWO EQUAL-WIDTH WHITE CARD PANELS:
      // Left Panel: Spending by Category (Cols B-G, Rows 18 to 27)
      // Right Panel: Spending Trend · Last 7 Days (Cols H-M, Rows 18 to 27)
      // Panel Titles (Row 18)
      { mergeCells: { range: { sheetId, startRowIndex: 17, endRowIndex: 18, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 17, endRowIndex: 18, startColumnIndex: 7, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 17, endRowIndex: 18, startColumnIndex: 1, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: navyText, bold: true, fontSize: 11 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 17, endRowIndex: 18, startColumnIndex: 7, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: navyText, bold: true, fontSize: 11 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },

      // Table Headers (Row 19)
      // Left Table: Category (Col B), Distribution (Cols C:D), Amount (Col E), Share (Cols F:G)
      { mergeCells: { range: { sheetId, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 2, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } }, // Distribution C:D
      { mergeCells: { range: { sheetId, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 5, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } }, // Share F:G
      // Right Table: Day (Col H), Date (Col I), Amount (Cols J:K), Daily % (Cols L:M)
      { mergeCells: { range: { sheetId, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 9, endColumnIndex: 11 }, mergeType: 'MERGE_ALL' } }, // Amount J:K
      { mergeCells: { range: { sheetId, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 11, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // Daily % L:M
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 8 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },

      // Data Rows (Rows 20 to 26): Merges & Formats
      ...[19, 20, 21, 22, 23, 24, 25, 26].flatMap((rIdx) => [
        { mergeCells: { range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 2, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } }, // Distribution C:D
        { mergeCells: { range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 5, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } }, // Share F:G
        { mergeCells: { range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 9, endColumnIndex: 11 }, mergeType: 'MERGE_ALL' } }, // Amount J:K
        { mergeCells: { range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 11, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // Daily % L:M
        {
          repeatCell: {
            range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 1, endColumnIndex: 13 },
            cell: {
              userEnteredFormat: {
                backgroundColor: cardBg,
                textFormat: { foregroundColor: navyText, fontSize: 9 },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
      ]),

      // Alignments & Number Formats for Category Table
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 19, endRowIndex: 27, startColumnIndex: 1, endColumnIndex: 2 },
          cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 19, endRowIndex: 27, startColumnIndex: 4, endColumnIndex: 5 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0' },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,numberFormat)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 19, endRowIndex: 27, startColumnIndex: 5, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
              numberFormat: { type: 'PERCENT', pattern: '0.00%' },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,numberFormat)',
        },
      },

      // Alignments & Number Formats for Spending Trend Table
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 19, endRowIndex: 27, startColumnIndex: 7, endColumnIndex: 9 },
          cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 19, endRowIndex: 27, startColumnIndex: 9, endColumnIndex: 11 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0' },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,numberFormat)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 19, endRowIndex: 27, startColumnIndex: 11, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
              numberFormat: { type: 'PERCENT', pattern: '0.0%' },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,numberFormat)',
        },
      },

      // Subtle horizontal dividers in tables matching HTML prototype
      ...[18, 19, 20, 21, 22, 23, 24, 25, 26].flatMap((rIdx) => [
        {
          updateBorders: {
            range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 1, endColumnIndex: 7 },
            bottom: { style: 'SOLID', color: rIdx === 18 ? headerBorder : rowDivider },
          },
        },
        {
          updateBorders: {
            range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 7, endColumnIndex: 13 },
            bottom: { style: 'SOLID', color: rIdx === 18 ? headerBorder : rowDivider },
          },
        },
      ]),

      // Outer borders for both panels
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 17, endRowIndex: 27, startColumnIndex: 1, endColumnIndex: 7 },
          top: { style: 'SOLID', color: cardBorder },
          bottom: { style: 'SOLID', color: cardBorder },
          left: { style: 'SOLID', color: cardBorder },
          right: { style: 'SOLID', color: cardBorder },
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 17, endRowIndex: 27, startColumnIndex: 7, endColumnIndex: 13 },
          top: { style: 'SOLID', color: cardBorder },
          bottom: { style: 'SOLID', color: cardBorder },
          left: { style: 'SOLID', color: cardBorder },
          right: { style: 'SOLID', color: cardBorder },
        },
      },

      // 11. LEND & BORROW SUMMARY Section Title (Row 29)
      { mergeCells: { range: { sheetId, startRowIndex: 28, endRowIndex: 29, startColumnIndex: 1, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 28, endRowIndex: 29, startColumnIndex: 1, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: sectionLabel, bold: true, fontSize: 9 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },

      // 12. LEND & BORROW: LEFT Net Position card (Rows 30 to 32, Cols B-G)
      { mergeCells: { range: { sheetId, startRowIndex: 29, endRowIndex: 30, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } }, // Net Position Label
      { mergeCells: { range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } }, // Net Position Value
      { mergeCells: { range: { sheetId, startRowIndex: 31, endRowIndex: 32, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } }, // Net Position Subtext
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 29, endRowIndex: 30, startColumnIndex: 1, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 9 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 1, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: navyText, bold: true, fontSize: 24 },
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0' },
              horizontalAlignment: 'LEFT',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment,verticalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 31, endRowIndex: 32, startColumnIndex: 1, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: subtext, bold: false, fontSize: 8 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 29, endRowIndex: 32, startColumnIndex: 1, endColumnIndex: 7 },
          top: { style: 'SOLID', color: cardBorder },
          bottom: { style: 'SOLID', color: cardBorder },
          left: { style: 'SOLID', color: cardBorder },
          right: { style: 'SOLID', color: cardBorder },
        },
      },

      // 13. LEND & BORROW: RIGHT 2 × 2 Grid (Cols H-M)
      // Row 1: Total Lent (H-J) | Total Borrowed (K-M) (Rows 30-31)
      { mergeCells: { range: { sheetId, startRowIndex: 29, endRowIndex: 30, startColumnIndex: 7, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' } }, // Total Lent Label
      { mergeCells: { range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 7, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' } }, // Total Lent Value
      { mergeCells: { range: { sheetId, startRowIndex: 29, endRowIndex: 30, startColumnIndex: 10, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // Total Borrowed Label
      { mergeCells: { range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 10, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // Total Borrowed Value

      // Row 2: Pending (H-J) | Overdue (K-M) (Rows 34-35)
      { mergeCells: { range: { sheetId, startRowIndex: 33, endRowIndex: 34, startColumnIndex: 7, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' } }, // Pending Label
      { mergeCells: { range: { sheetId, startRowIndex: 34, endRowIndex: 35, startColumnIndex: 7, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' } }, // Pending Value
      { mergeCells: { range: { sheetId, startRowIndex: 33, endRowIndex: 34, startColumnIndex: 10, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // Overdue Label
      { mergeCells: { range: { sheetId, startRowIndex: 34, endRowIndex: 35, startColumnIndex: 10, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } }, // Overdue Value

      // 2x2 Labels Style
      ...[
        { row: 29, colStart: 7, colEnd: 10, title: 'Total Lent' },
        { row: 29, colStart: 10, colEnd: 13, title: 'Total Borrowed' },
        { row: 33, colStart: 7, colEnd: 10, title: 'Pending' },
        { row: 33, colStart: 10, colEnd: 13, title: 'Overdue' },
      ].map((item) => ({
        repeatCell: {
          range: { sheetId, startRowIndex: item.row, endRowIndex: item.row + 1, startColumnIndex: item.colStart, endColumnIndex: item.colEnd },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 8 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      })),

      // 2x2 Values Style
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 7, endColumnIndex: 10 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: navyText, bold: true, fontSize: 14 },
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0' },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 10, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: navyText, bold: true, fontSize: 14 },
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0' },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 34, endRowIndex: 35, startColumnIndex: 7, endColumnIndex: 10 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: pendingAmber, bold: true, fontSize: 14 },
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0' },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 34, endRowIndex: 35, startColumnIndex: 10, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: cardBg,
              textFormat: { foregroundColor: overdueRed, bold: true, fontSize: 14 },
              numberFormat: { type: 'CURRENCY', pattern: '"Rs "#,##0' },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment)',
        },
      },

      // 2x2 Card Borders
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 29, endRowIndex: 31, startColumnIndex: 7, endColumnIndex: 10 },
          top: { style: 'SOLID', color: cardBorder },
          bottom: { style: 'SOLID', color: cardBorder },
          left: { style: 'SOLID', color: cardBorder },
          right: { style: 'SOLID', color: cardBorder },
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 29, endRowIndex: 31, startColumnIndex: 10, endColumnIndex: 13 },
          top: { style: 'SOLID', color: cardBorder },
          bottom: { style: 'SOLID', color: cardBorder },
          left: { style: 'SOLID', color: cardBorder },
          right: { style: 'SOLID', color: cardBorder },
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 33, endRowIndex: 35, startColumnIndex: 7, endColumnIndex: 10 },
          top: { style: 'SOLID', color: cardBorder },
          bottom: { style: 'SOLID', color: cardBorder },
          left: { style: 'SOLID', color: cardBorder },
          right: { style: 'SOLID', color: cardBorder },
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 33, endRowIndex: 35, startColumnIndex: 10, endColumnIndex: 13 },
          top: { style: 'SOLID', color: cardBorder },
          bottom: { style: 'SOLID', color: cardBorder },
          left: { style: 'SOLID', color: cardBorder },
          right: { style: 'SOLID', color: cardBorder },
        },
      },

      // 14. FOOTER (Row 37)
      { mergeCells: { range: { sheetId, startRowIndex: 36, endRowIndex: 37, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 36, endRowIndex: 37, startColumnIndex: 7, endColumnIndex: 13 }, mergeType: 'MERGE_ALL' } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 36, endRowIndex: 37, startColumnIndex: 1, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: footerText, bold: false, fontSize: 8 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 36, endRowIndex: 37, startColumnIndex: 7, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: footerText, bold: false, fontSize: 8 },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
    ];

    // Batch Update 1: Apply layout, formatting, cards, borders, dropdowns
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

    // Clean up any unnecessary embedded charts so it strictly matches the clean HTML prototype
    if (dashSheet.charts && dashSheet.charts.length > 0) {
      const deleteRequests = dashSheet.charts
        .filter((c: any) => c?.chartId !== undefined)
        .map((c: any) => ({
          deleteEmbeddedObject: {
            objectId: c.chartId,
          },
        }));

      if (deleteRequests.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests: deleteRequests }),
        }).catch(console.warn);
      }
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
            requests: [{ addSheet: { properties: { title: 'Dashboard', gridProperties: { rowCount: 52, columnCount: 16 } } } }],
          }),
        });
      }
    }
  } catch (e) {
    console.warn('Dashboard existence check notice:', e);
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const todayStr = now.toISOString().split('T')[0];

  const catFood = categories.find((c) => c.category === 'Food') || { amount: 0, count: 0 };
  const catTransport = categories.find((c) => c.category === 'Transport') || { amount: 0, count: 0 };
  const catShopping = categories.find((c) => c.category === 'Shopping') || { amount: 0, count: 0 };
  const catBills = categories.find((c) => c.category === 'Bills') || { amount: 0, count: 0 };
  const catEnt = categories.find((c) => c.category === 'Entertainment') || { amount: 0, count: 0 };
  const catEdu = categories.find((c) => c.category === 'Education') || { amount: 0, count: 0 };
  const catOther = categories.find((c) => c.category === 'Other') || { amount: 0, count: 0 };

  const thisMonthPrefix = todayStr.slice(0, 7);

  // Compute Today's Spend & Month's Spend
  const todaySpend = recentTransactions
    ? recentTransactions
        .filter((tx) => tx.type !== 'cash_added' && (tx.date === todayStr || (!tx.date && new Date(tx.createdAt || 0).toISOString().startsWith(todayStr))))
        .reduce((sum, tx) => sum + (tx.amount || 0), 0)
    : 0;

  const thisMonthSpend = recentTransactions
    ? recentTransactions
        .filter((tx) => tx.type !== 'cash_added' && (tx.date?.startsWith(thisMonthPrefix) || (!tx.date && new Date(tx.createdAt || 0).toISOString().startsWith(thisMonthPrefix))))
        .reduce((sum, tx) => sum + (tx.amount || 0), 0)
    : 0;

  // Compute Lend & Borrow Totals
  const totalLent = lendItems
    ? lendItems.filter((i) => i.type === 'lent').reduce((sum, i) => sum + (i.amount || 0), 0)
    : 0;
  const totalBorrowed = lendItems
    ? lendItems.filter((i) => i.type === 'borrowed').reduce((sum, i) => sum + (i.amount || 0), 0)
    : 0;
  const pendingTotal = lendItems
    ? lendItems.filter((i) => i.status !== 'settled').reduce((sum, i) => sum + (i.amount || 0), 0)
    : 0;
  const overdueTotal = lendItems
    ? lendItems
        .filter((i) => i.status !== 'settled' && i.dueDate && i.dueDate < todayStr)
        .reduce((sum, i) => sum + (i.amount || 0), 0)
    : 0;

  // Sorted Recent Activity (top 6)
  const sortedRecent = recentTransactions
    ? [...recentTransactions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6)
    : [];

  const activityRows: (string | number)[][] = [];
  for (let i = 0; i < 6; i++) {
    const tx = sortedRecent[i];
    const txDate = tx?.date || (tx?.createdAt ? new Date(tx.createdAt).toISOString().split('T')[0] : '—');
    const txCat = tx ? `${tx.category || 'General'} (${tx.type === 'cash_added' ? 'Income' : tx.type === 'card_expense' ? 'Card' : 'Cash'})` : '—';
    const txPay = tx?.paymentMethod || (tx?.type === 'card_expense' ? 'Card' : tx?.type ? 'Cash' : '—');
    const txAmt = tx ? tx.amount : 0;
    activityRows.push([txDate, txCat, '', txPay, '', txAmt, '']);
  }

  // 6 Lend & Borrow rows
  const lendRows: (string | number)[][] = [
    ['Total Lent', '', totalLent, '', ''],
    ['Total Borrowed', '', totalBorrowed, '', ''],
    ['Pending', '', pendingTotal, '', ''],
    ['Overdue', '', overdueTotal, '', ''],
    ['Net Position', '', `=K28-K29`, '', ''],
    ['Status', '', `=IF(K30=0, "All Clear", "Active Items")`, '', ''],
  ];

  // Complete Dashboard values matrix (Rows 1 to 33, Cols A to M)
  const dashboardValues = [
    // Row 1 (margin)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 2: SPENDDESK Heading & Date
    ['', 'SPENDDESK', '', '', '', '', '', '', '', `Date: ${dateStr}`, '', '', ''],
    // Row 3: Subtitle
    ['', 'Personal Finance Dashboard', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 4 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 5: Filter & Controls (Period, Date Range, Sync Status)
    [
      '',
      'Period', 'All Time', '',
      '', 'Date Range', 'Live Synced', '',
      '', 'Sync Status', 'Connected & Active', '', '',
    ],
    // Row 6 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 7: KPI Row 1 Titles
    [
      '',
      'Cash Balance', '', '',
      'Total Spend', '', '',
      'Card Spend', '', '',
      'Cash Added', '', '',
    ],
    // Row 8: KPI Row 1 Values
    [
      '',
      `=IFERROR(INDEX(FILTER(Transactions!H3:H, Transactions!H3:H<>""), COUNTA(FILTER(Transactions!H3:H, Transactions!H3:H<>""))), ${summary.currentCashBalance})`, '', '',
      `=IFERROR(SUM(D17:D23), ${summary.totalSpend})`, '', '',
      `=IFERROR(SUMIF(Transactions!C3:C, "card_expense", Transactions!E3:E), ${summary.cardSpend})`, '', '',
      `=IFERROR(SUMIF(Transactions!C3:C, "cash_added", Transactions!E3:E), ${summary.cashAdded})`, '', '',
    ],
    // Row 9 (KPI Row 1 bottom padding)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 10 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 11: KPI Row 2 Titles
    [
      '',
      'Cash Spent', '', '',
      "Today's Spend", '', '',
      "This Month's Spend", '', '',
      'Pending Lend / Borrow', '', '',
    ],
    // Row 12: KPI Row 2 Values
    [
      '',
      `=IFERROR(SUMIF(Transactions!C3:C, "cash_expense", Transactions!E3:E), ${summary.cashSpent})`, '', '',
      `=IFERROR(SUMIFS(Transactions!E3:E, Transactions!C3:C, "<>cash_added", Transactions!A3:A, TEXT(TODAY(), "yyyy-mm-dd")), ${todaySpend})`, '', '',
      `=IFERROR(SUMIFS(Transactions!E3:E, Transactions!C3:C, "<>cash_added", Transactions!A3:A, ">=" & TEXT(EOMONTH(TODAY(), -1) + 1, "yyyy-mm-dd")), ${thisMonthSpend})`, '', '',
      `=IFERROR(SUMIF(Lend_Borrow!H2:H, "Pending", Lend_Borrow!E2:E), ${pendingTotal})`, '', '',
    ],
    // Row 13 (KPI Row 2 bottom padding)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 14 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 15: Section Titles 1
    [
      '',
      'Spending by Category', '', '', '', '', '',
      'Spending Trend', '', '', '', '', '',
    ],
    // Row 16: Table Headers 1
    [
      '',
      'Category', 'Count', 'Amount', 'Share %', 'Distribution', '',
      'Day', 'Date', 'Amount', 'Daily %', 'Daily Trend', '',
    ],
    // Row 17 (Food / Mon)
    [
      '',
      'Food', catFood.count, `=IFERROR(SUMIF(Transactions!D3:D, "Food", Transactions!E3:E), ${catFood.amount})`, '=IF($D$24>0, D17/$D$24, 0)',
      '=IF(D17>0, SPARKLINE(D17, {"charttype","bar";"max",MAX(D$17:D$23)+1;"color1","#1F3A64"}), "—")', '',
      'Mon', 'Day 1', dailySpend['Mon'] || 0, '=IF($J$24>0, J17/$J$24, 0)',
      '=IF(J17>0, SPARKLINE(J17, {"charttype","bar";"max",MAX(J$17:J$23)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 18 (Transport / Tue)
    [
      '',
      'Transport', catTransport.count, `=IFERROR(SUMIF(Transactions!D3:D, "Transport", Transactions!E3:E), ${catTransport.amount})`, '=IF($D$24>0, D18/$D$24, 0)',
      '=IF(D18>0, SPARKLINE(D18, {"charttype","bar";"max",MAX(D$17:D$23)+1;"color1","#1F3A64"}), "—")', '',
      'Tue', 'Day 2', dailySpend['Tue'] || 0, '=IF($J$24>0, J18/$J$24, 0)',
      '=IF(J18>0, SPARKLINE(J18, {"charttype","bar";"max",MAX(J$17:J$23)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 19 (Shopping / Wed)
    [
      '',
      'Shopping', catShopping.count, `=IFERROR(SUMIF(Transactions!D3:D, "Shopping", Transactions!E3:E), ${catShopping.amount})`, '=IF($D$24>0, D19/$D$24, 0)',
      '=IF(D19>0, SPARKLINE(D19, {"charttype","bar";"max",MAX(D$17:D$23)+1;"color1","#1F3A64"}), "—")', '',
      'Wed', 'Day 3', dailySpend['Wed'] || 0, '=IF($J$24>0, J19/$J$24, 0)',
      '=IF(J19>0, SPARKLINE(J19, {"charttype","bar";"max",MAX(J$17:J$23)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 20 (Bills / Thu)
    [
      '',
      'Bills', catBills.count, `=IFERROR(SUMIF(Transactions!D3:D, "Bills", Transactions!E3:E), ${catBills.amount})`, '=IF($D$24>0, D20/$D$24, 0)',
      '=IF(D20>0, SPARKLINE(D20, {"charttype","bar";"max",MAX(D$17:D$23)+1;"color1","#1F3A64"}), "—")', '',
      'Thu', 'Day 4', dailySpend['Thu'] || 0, '=IF($J$24>0, J20/$J$24, 0)',
      '=IF(J20>0, SPARKLINE(J20, {"charttype","bar";"max",MAX(J$17:J$23)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 21 (Entertainment / Fri)
    [
      '',
      'Entertainment', catEnt.count, `=IFERROR(SUMIF(Transactions!D3:D, "Entertainment", Transactions!E3:E), ${catEnt.amount})`, '=IF($D$24>0, D21/$D$24, 0)',
      '=IF(D21>0, SPARKLINE(D21, {"charttype","bar";"max",MAX(D$17:D$23)+1;"color1","#1F3A64"}), "—")', '',
      'Fri', 'Day 5', dailySpend['Fri'] || 0, '=IF($J$24>0, J21/$J$24, 0)',
      '=IF(J21>0, SPARKLINE(J21, {"charttype","bar";"max",MAX(J$17:J$23)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 22 (Education / Sat)
    [
      '',
      'Education', catEdu.count, `=IFERROR(SUMIF(Transactions!D3:D, "Education", Transactions!E3:E), ${catEdu.amount})`, '=IF($D$24>0, D22/$D$24, 0)',
      '=IF(D22>0, SPARKLINE(D22, {"charttype","bar";"max",MAX(D$17:D$23)+1;"color1","#1F3A64"}), "—")', '',
      'Sat', 'Day 6', dailySpend['Sat'] || 0, '=IF($J$24>0, J22/$J$24, 0)',
      '=IF(J22>0, SPARKLINE(J22, {"charttype","bar";"max",MAX(J$17:J$23)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 23 (Other / Sun)
    [
      '',
      'Other', catOther.count, `=IFERROR(SUMIF(Transactions!D3:D, "Other", Transactions!E3:E), ${catOther.amount})`, '=IF($D$24>0, D23/$D$24, 0)',
      '=IF(D23>0, SPARKLINE(D23, {"charttype","bar";"max",MAX(D$17:D$23)+1;"color1","#1F3A64"}), "—")', '',
      'Sun', 'Day 7', dailySpend['Sun'] || 0, '=IF($J$24>0, J23/$J$24, 0)',
      '=IF(J23>0, SPARKLINE(J23, {"charttype","bar";"max",MAX(J$17:J$23)+1;"color1","#2563EB"}), "—")', '',
    ],
    // Row 24: Total Rows
    [
      '',
      'Total', '=SUM(C17:C23)', '=SUM(D17:D23)', '100.0%',
      '=SPARKLINE(D17:D23, {"charttype","column";"color","#1F3A64"})', '',
      'Total 7-Day Spend', '', '=SUM(J17:J23)', '100.0%',
      '=SPARKLINE(J17:J23, {"charttype","column";"color","#2563EB"})', '',
    ],
    // Row 25 (spacer)
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 26: Section Titles 2
    [
      '',
      'Recent Activity', '', '', '', '', '', '',
      'Lend & Borrow Summary', '', '', '', '',
    ],
    // Row 27: Table Headers 2
    [
      '',
      'Date', 'Category / Type', '', 'Payment Method', '', 'Amount', '',
      'Metric', '', 'Amount', '', '',
    ],
    // Rows 28-33: Activity & Lend/Borrow
    ['', ...activityRows[0], ...lendRows[0]],
    ['', ...activityRows[1], ...lendRows[1]],
    ['', ...activityRows[2], ...lendRows[2]],
    ['', ...activityRows[3], ...lendRows[3]],
    ['', ...activityRows[4], ...lendRows[4]],
    ['', ...activityRows[5], ...lendRows[5]],
  ];

  // Write full dashboard grid (Rows 1 to 33, Cols A to M)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Dashboard!A1:M33?valueInputOption=USER_ENTERED`,
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

  // Ensure full layout, gridline removal, 8 KPI cards styling, dropdowns, and charts are applied on every sync!
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
