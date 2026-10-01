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

    // Modern Soft Indigo / Navy (#1a2b4c) per user request - softer and cleaner than harsh dark blue
    const softNavy = { red: 26 / 255, green: 43 / 255, blue: 76 / 255 }; // #1a2b4c
    const white = { red: 1, green: 1, blue: 1 };
    const greenText = { red: 13 / 255, green: 115 / 255, blue: 55 / 255 }; // #0d7337
    const greenBg = { red: 230 / 255, green: 244 / 255, blue: 234 / 255 }; // #e6f4ea
    const redText = { red: 197 / 255, green: 34 / 255, blue: 31 / 255 }; // #c5221f
    const redBg = { red: 252 / 255, green: 232 / 255, blue: 230 / 255 }; // #fce8e6
    const blueText = { red: 26 / 255, green: 115 / 255, blue: 232 / 255 }; // #1a73e8
    const lightGreyBorder = { red: 229 / 255, green: 231 / 255, blue: 235 / 255 }; // #e5e7eb
    const lightBlueRowBg = { red: 232 / 255, green: 240 / 255, blue: 254 / 255 }; // #e8f0fe
    const spacerBg = { red: 248 / 255, green: 249 / 255, blue: 250 / 255 }; // #f8f9fa

    const requests: any[] = [
      // 1. Column Widths (breathing room + thin gap columns for Balance/Out of Wallet and Card Payment)
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, // Col A Date
          properties: { pixelSize: 95 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, // Col B Time
          properties: { pixelSize: 70 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, // Col C Type
          properties: { pixelSize: 60 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, // Col D Category
          properties: { pixelSize: 110 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, // Col E Amount
          properties: { pixelSize: 95 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, // Col F Note
          properties: { pixelSize: 140 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, // Col G Payment Method
          properties: { pixelSize: 110 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, // Col H Balance
          properties: { pixelSize: 105 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, // Col I Thin Spacer Gap (25px)
          properties: { pixelSize: 25 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, // Col J Out of Wallet
          properties: { pixelSize: 105 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }, // Col K Thin Spacer Gap (25px)
          properties: { pixelSize: 25 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 11, endIndex: 12 }, // Col L Card Payment
          properties: { pixelSize: 105 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, // Col M Spacer before Lend (30px)
          properties: { pixelSize: 30 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, // Col N Lend Date & Time
          properties: { pixelSize: 105 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, // Col O Lend Amount
          properties: { pixelSize: 90 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 15, endIndex: 16 }, // Col P Lend Person / Reason
          properties: { pixelSize: 140 },
          fields: 'pixelSize',
        },
      },
      // 2. Format Row 1 Header A1:H1 (Date to Balance) with soft navy
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
      // 3. Spacer Col I on Row 1 (subtle clean gap)
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
      // 4. Col J Row 1 Header (Out of Wallet) with soft navy
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 9, endColumnIndex: 10 },
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
      // 5. Spacer Col K on Row 1 (subtle clean gap)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 10, endColumnIndex: 11 },
          cell: {
            userEnteredFormat: {
              backgroundColor: spacerBg,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // 6. Col L Row 1 Header (Card Payment) with soft navy
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 11, endColumnIndex: 12 },
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
      // 7. Spacer Col M on Row 1
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 12, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: spacerBg,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // 8. Format & Merge LEND MONEY header over N1:P1 (columns 13 to 16) with soft navy
      {
        mergeCells: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 13, endColumnIndex: 16 },
          mergeType: 'MERGE_ALL',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 13, endColumnIndex: 16 },
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
      // 9. Format Row 2 Subheaders for Lend Money N2:P2 (Date & Time, Amount, Reason / Person)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 13, endColumnIndex: 16 },
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
      // 10. Freeze top 1 row
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      // 11. Clean up any data validations
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
      // 12. Base Alignment & Fonts for Date and Time (Blue text, centered)
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
      // 13. Right alignment for Amount, Balance
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
      // 14. Out of Wallet (Col J, index 9) and Card Payment (Col L, index 11) right-aligned
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
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 11, endColumnIndex: 12 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: blueText },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // 15. Lend Money data column styling: Date & Time in Col N (blue text), Amount in Col O (blue, right-aligned)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 13, endColumnIndex: 14 },
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
          range: { sheetId, startRowIndex: 2, endRowIndex: 3000, startColumnIndex: 14, endColumnIndex: 15 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: blueText },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // 16. Subtle light borders across rows and columns
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

    // Format specific date banner rows: STOPS AT CARD PAYMENT COLUMN (Col L, endColumnIndex: 12)!
    if (dateRowIndices && dateRowIndices.length > 0) {
      dateRowIndices.forEach((rIdx) => {
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 0, endColumnIndex: 12 },
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

    // Only apply conditional formatting if not already present
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
        // Rule: Out of Wallet (Col J, index 9) -> Soft red background & red bold text!
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

    // Corporate SaaS color palette (#1A2B4C accent, #F8F9FA canvas, #ECFDF5 balance highlight)
    const softNavy = { red: 26 / 255, green: 43 / 255, blue: 76 / 255 }; // #1a2b4c Soft Indigo/Navy
    const canvasBg = { red: 248 / 255, green: 249 / 255, blue: 250 / 255 }; // #f8f9fa
    const white = { red: 1, green: 1, blue: 1 };
    const subtleBorder = { red: 229 / 255, green: 231 / 255, blue: 235 / 255 }; // #e5e7eb
    const balanceBg = { red: 236 / 255, green: 253 / 255, blue: 245 / 255 }; // #ecfdf5
    const balanceText = { red: 4 / 255, green: 120 / 255, blue: 87 / 255 }; // #047857
    const balanceBorder = { red: 167 / 255, green: 243 / 255, blue: 208 / 255 }; // #a7f3d0
    const mutedLabel = { red: 100 / 255, green: 116 / 255, blue: 139 / 255 }; // #64748b
    const darkText = { red: 15 / 255, green: 23 / 255, blue: 42 / 255 }; // #0f172a
    const roseText = { red: 225 / 255, green: 29 / 255, blue: 72 / 255 }; // #e11d48
    const blueText = { red: 37 / 255, green: 99 / 255, blue: 235 / 255 }; // #2563eb
    const redText = { red: 220 / 255, green: 38 / 255, blue: 38 / 255 }; // #dc2626
    const headerPillBg = { red: 241 / 255, green: 245 / 255, blue: 249 / 255 }; // #f1f5f9
    const zebraBg = { red: 249 / 255, green: 250 / 255, blue: 251 / 255 }; // #f9fafb

    const requests: any[] = [
      // 1. Fill entire canvas A1:M25 with very light gray background (#F8F9FA)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 25, startColumnIndex: 0, endColumnIndex: 13 },
          cell: {
            userEnteredFormat: {
              backgroundColor: canvasBg,
            },
          },
          fields: 'userEnteredFormat(backgroundColor)',
        },
      },
      // 2. Set Row Heights (35px-45px for ample breathing room)
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, // Row 1 top margin
          properties: { pixelSize: 15 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, // Row 2 Title row
          properties: { pixelSize: 38 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 2, endIndex: 3 }, // Row 3 spacer
          properties: { pixelSize: 15 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 }, // Row 4 KPI Labels 1
          properties: { pixelSize: 26 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 4, endIndex: 5 }, // Row 5 KPI Values 1 (42px)
          properties: { pixelSize: 42 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 5, endIndex: 6 }, // Row 6 spacer
          properties: { pixelSize: 15 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 6, endIndex: 7 }, // Row 7 KPI Labels 2
          properties: { pixelSize: 26 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 7, endIndex: 8 }, // Row 8 KPI Values 2 (42px)
          properties: { pixelSize: 42 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 8, endIndex: 9 }, // Row 9 spacer
          properties: { pixelSize: 20 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 9, endIndex: 10 }, // Row 10 section headers
          properties: { pixelSize: 32 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 10, endIndex: 11 }, // Row 11 table headers
          properties: { pixelSize: 28 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 11, endIndex: 18 }, // Rows 12-18 data rows
          properties: { pixelSize: 30 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 18, endIndex: 19 }, // Row 19 Total row
          properties: { pixelSize: 32 },
          fields: 'pixelSize',
        },
      },
      // 3. Set Column Widths
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, // Col A margin
          properties: { pixelSize: 25 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 }, // Cols B, C (Card 1 / Category)
          properties: { pixelSize: 110 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, // Col D card spacer
          properties: { pixelSize: 18 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 6 }, // Cols E, F (Card 2 / Daily Trend)
          properties: { pixelSize: 110 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, // Col G card spacer
          properties: { pixelSize: 18 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 9 }, // Cols H, I (Card 3)
          properties: { pixelSize: 110 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, // Col J chart spacer
          properties: { pixelSize: 20 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 13 }, // Cols K, L, M chart area
          properties: { pixelSize: 140 },
          fields: 'pixelSize',
        },
      },
      // 4. Merge KPI Card cells (Row 4 & 5; Row 7 & 8)
      { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 4, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 4, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 7, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 7, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 4, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 4, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 7, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 7, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
      // 5. Header Title Row 2 (B2:C2)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: softNavy, bold: true, fontSize: 13 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 2, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: mutedLabel, bold: false, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // 6. Card 1: CURRENT BALANCE (Soft Emerald Highlight #ECFDF5, text #047857)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              backgroundColor: balanceBg,
              textFormat: { foregroundColor: balanceText, bold: true, fontSize: 8 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              backgroundColor: balanceBg,
              textFormat: { foregroundColor: balanceText, bold: true, fontSize: 16 },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 3 },
          top: { style: 'SOLID', color: balanceBorder },
          bottom: { style: 'SOLID', color: balanceBorder },
          left: { style: 'SOLID', color: balanceBorder },
          right: { style: 'SOLID', color: balanceBorder },
        },
      },
      // 7. Cards 2 to 6: White background with subtle thin gray borders (#E5E7EB)
      ...[
        { range: { startRowIndex: 3, endRowIndex: 5, startColumnIndex: 4, endColumnIndex: 6 }, valColor: darkText }, // Cash Added
        { range: { startRowIndex: 3, endRowIndex: 5, startColumnIndex: 7, endColumnIndex: 9 }, valColor: roseText }, // Cash Spent
        { range: { startRowIndex: 6, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 3 }, valColor: blueText }, // Card Spent
        { range: { startRowIndex: 6, endRowIndex: 8, startColumnIndex: 4, endColumnIndex: 6 }, valColor: darkText }, // Total Spent
        { range: { startRowIndex: 6, endRowIndex: 8, startColumnIndex: 7, endColumnIndex: 9 }, valColor: redText }, // Out of Wallet
      ].flatMap((card) => [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: card.range.startRowIndex, endRowIndex: card.range.startRowIndex + 1, startColumnIndex: card.range.startColumnIndex, endColumnIndex: card.range.endColumnIndex },
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
            range: { sheetId, startRowIndex: card.range.startRowIndex + 1, endRowIndex: card.range.endRowIndex, startColumnIndex: card.range.startColumnIndex, endColumnIndex: card.range.endColumnIndex },
            cell: {
              userEnteredFormat: {
                backgroundColor: white,
                textFormat: { foregroundColor: card.valColor, bold: true, fontSize: 14 },
                horizontalAlignment: 'RIGHT',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        {
          updateBorders: {
            range: { sheetId, ...card.range },
            top: { style: 'SOLID', color: subtleBorder },
            bottom: { style: 'SOLID', color: subtleBorder },
            left: { style: 'SOLID', color: subtleBorder },
            right: { style: 'SOLID', color: subtleBorder },
          },
        },
      ]),
      // 8. Section Headers (Row 10)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: softNavy, bold: true, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 4, endColumnIndex: 6 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: softNavy, bold: true, fontSize: 10 },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
        },
      },
      // 9. Table Headers (Row 11) - Light gray header pills (#F1F5F9)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerPillBg,
              textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 9 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 4, endColumnIndex: 6 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerPillBg,
              textFormat: { foregroundColor: mutedLabel, bold: true, fontSize: 9 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
      // 10. Alternating white / zebra rows for Category Table & Daily Trend Table (Rows 12-18)
      ...[11, 12, 13, 14, 15, 16, 17].map((rIdx) => ({
        repeatCell: {
          range: { sheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1, startColumnIndex: 1, endColumnIndex: 6 },
          cell: {
            userEnteredFormat: {
              backgroundColor: rIdx % 2 === 1 ? white : zebraBg,
              textFormat: { foregroundColor: darkText, fontSize: 9 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      })),
      // 11. Right alignment for monetary amounts (Col C and Col F, Rows 11 to 19)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 10, endRowIndex: 19, startColumnIndex: 2, endColumnIndex: 3 },
          cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 10, endRowIndex: 19, startColumnIndex: 5, endColumnIndex: 6 },
          cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
          fields: 'userEnteredFormat(horizontalAlignment)',
        },
      },
      // 12. Total Rows (Row 19)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 1, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerPillBg,
              textFormat: { foregroundColor: softNavy, bold: true, fontSize: 9 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 4, endColumnIndex: 6 },
          cell: {
            userEnteredFormat: {
              backgroundColor: headerPillBg,
              textFormat: { foregroundColor: softNavy, bold: true, fontSize: 9 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
      // 13. Subtle thin borders on Category and Daily Trend tables
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 10, endRowIndex: 19, startColumnIndex: 1, endColumnIndex: 3 },
          top: { style: 'SOLID', color: subtleBorder },
          bottom: { style: 'SOLID', color: subtleBorder },
          left: { style: 'SOLID', color: subtleBorder },
          right: { style: 'SOLID', color: subtleBorder },
          innerHorizontal: { style: 'SOLID', color: subtleBorder },
        },
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 10, endRowIndex: 19, startColumnIndex: 4, endColumnIndex: 6 },
          top: { style: 'SOLID', color: subtleBorder },
          bottom: { style: 'SOLID', color: subtleBorder },
          left: { style: 'SOLID', color: subtleBorder },
          right: { style: 'SOLID', color: subtleBorder },
          innerHorizontal: { style: 'SOLID', color: subtleBorder },
        },
      },
    ];

    // 14. If chart does not already exist, add a soft modern Donut Chart on Col H:L, Rows 10-19
    const existingCharts = dashSheet.charts || [];
    if (existingCharts.length === 0) {
      requests.push({
        addChart: {
          chart: {
            spec: {
              title: 'Category Distribution',
              titleTextFormat: {
                foregroundColor: softNavy,
                fontSize: 10,
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
                        startRowIndex: 11,
                        endRowIndex: 18,
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
                        startRowIndex: 11,
                        endRowIndex: 18,
                        startColumnIndex: 2,
                        endColumnIndex: 3,
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
                  rowIndex: 9,
                  columnIndex: 7,
                },
                widthPixels: 380,
                heightPixels: 270,
              },
            },
          },
        },
      });
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
    console.warn('Dashboard sheet formatting notice:', e);
  }
};

export const initializeSheetLayout = async (accessToken: string, spreadsheetId: string) => {
  // Set up Transactions headers matching user specification:
  // Row 1: Date, Time, Type, Category, Amount, Note, Payment Method, Balance, [Spacer 25px], Out of Wallet, [Spacer 25px], Card Payment, [Spacer 30px], LEND MONEY
  // Row 2: Subheaders for Lend Money N2:P2 (Date & Time, Amount, Reason / Person)
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
        '', // Col I: thin spacer gap (25px)
        'Out of Wallet', // Col J
        '', // Col K: thin spacer gap (25px)
        'Card Payment', // Col L
        '', // Col M: spacer before Lend Money (30px)
        'LEND MONEY', // Col N
        '',
        '',
      ],
      [
        '', '', '', '', '', '', '', '', '', '', '', '', '',
        'Date & Time',
        'Amount',
        'Reason / Person',
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

  // Apply soft navy formatting, white bold text and frozen rows
  await applyTransactionsSheetDesign(accessToken, spreadsheetId);

  // If Lend_Borrow sheet exists, remove it per user request
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      const lendSheet = metaData.sheets?.find((s: any) => s.properties?.title === 'Lend_Borrow');
      if (lendSheet) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [{ deleteSheet: { sheetId: lendSheet.properties.sheetId } }],
          }),
        });
      }
    }
  } catch (err) {
    console.warn('Lend_Borrow sheet cleanup notice:', err);
  }

  // Set up Dashboard matching modern corporate SaaS 2x3 KPI card layout
  const todayStr = new Date().toISOString().split('T')[0];
  const dashboardValues = [
    ['', '', '', '', '', '', '', '', '', ''],
    ['', 'SPENDDESK', 'Executive Financial Dashboard', '', '', '', 'Date:', todayStr, '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    ['', 'CURRENT BALANCE', '', '', 'CASH ADDED', '', '', 'CASH SPENT', '', ''],
    ['', 0, '', '', 0, '', '', 0, '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    ['', 'CARD SPENT', '', '', 'TOTAL SPENT', '', '', 'OUT OF WALLET', '', ''],
    ['', 0, '', '', 0, '', '', 0, '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    ['', 'SPENDING BY CATEGORY', '', '', 'DAILY SPENDING TREND', '', '', '', '', ''],
    ['', 'Category', 'Amount', '', 'Day', 'Amount', '', '', '', ''],
    ['', 'Food', 0, '', 'Mon', 0, '', '', '', ''],
    ['', 'Transport', 0, '', 'Tue', 0, '', '', '', ''],
    ['', 'Shopping', 0, '', 'Wed', 0, '', '', '', ''],
    ['', 'Bills', 0, '', 'Thu', 0, '', '', '', ''],
    ['', 'Entertainment', 0, '', 'Fri', 0, '', '', '', ''],
    ['', 'Education', 0, '', 'Sat', 0, '', '', '', ''],
    ['', 'Other', 0, '', 'Sun', 0, '', '', '', ''],
    ['', 'Total', '=SUM(C12:C18)', '', 'Total', '=SUM(F12:F18)', '', '', '', ''],
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Dashboard!A1:J19?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: dashboardValues }),
    }
  );

  await applyDashboardSheetDesign(accessToken, spreadsheetId);
};

export const syncDashboardStats = async (
  accessToken: string,
  spreadsheetId: string,
  summary: SpendingSummary,
  categories: CategorySummary[],
  dailySpend: { [day: string]: number }
) => {
  // Sync numbers cleanly to Dashboard KPI cards & tables
  const updateCalls = [
    // Current Balance (Row 5, Col B)
    {
      range: 'Dashboard!B5',
      values: [[summary.currentCashBalance]],
    },
    // Cash Added (Row 5, Col E)
    {
      range: 'Dashboard!E5',
      values: [[summary.cashAdded]],
    },
    // Cash Spent (Row 5, Col H)
    {
      range: 'Dashboard!H5',
      values: [[summary.cashSpent]],
    },
    // Card Spent (Row 8, Col B)
    {
      range: 'Dashboard!B8',
      values: [[summary.cardSpend]],
    },
    // Total Spent (Row 8, Col E)
    {
      range: 'Dashboard!E8',
      values: [[summary.totalSpend]],
    },
    // Out of Wallet (Row 8, Col H)
    {
      range: 'Dashboard!H8',
      values: [[summary.outOfWallet]],
    },
    // Category Breakdown rows (clean numbers) Col C12:C18
    {
      range: 'Dashboard!C12:C18',
      values: [
        [categories.find((c) => c.category === 'Food')?.amount || 0],
        [categories.find((c) => c.category === 'Transport')?.amount || 0],
        [categories.find((c) => c.category === 'Shopping')?.amount || 0],
        [categories.find((c) => c.category === 'Bills')?.amount || 0],
        [categories.find((c) => c.category === 'Entertainment')?.amount || 0],
        [categories.find((c) => c.category === 'Education')?.amount || 0],
        [categories.find((c) => c.category === 'Other')?.amount || 0],
      ],
    },
    // Mon-Sun Daily trend (clean numbers) Col F12:F18
    {
      range: 'Dashboard!F12:F18',
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
    console.warn('Dashboard sync notice: update non-fatal', await statsResponse.text());
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

    // Side lend column for the date banner row if available
    const lendBanner = lendIdx < safeLends.length ? safeLends[lendIdx++] : null;
    const lendBannerCols = lendBanner
      ? [
          formatLendDateTime(lendBanner),
          lendBanner.amount, // clean numeric, no Rs
          `${lendBanner.personName}${lendBanner.thingsOrReason ? ` - ${lendBanner.thingsOrReason}` : ''}`,
        ]
      : ['', '', ''];

    // Track 0-indexed row position for light blue date row styling in Google Sheets (starts at row 3 = index 2)
    dateRowIndices.push(rows.length + 2);

    // Date header banner row: Col D has bold centered date matching user screenshot
    rows.push([
      '', '', '', dateHeader, '', '', '', '', '', '', '', '', '',
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
            nextLend.amount, // clean numeric, no Rs
            `${nextLend.personName}${nextLend.thingsOrReason ? ` - ${nextLend.thingsOrReason}` : ''}`,
          ]
        : ['', '', ''];

      rows.push([
        tx.date || '',
        tx.time || '',
        isCashIn ? 'IN' : 'OUT',
        tx.category || (isCashIn ? 'Cash Added' : 'Other'),
        tx.amount, // clean numeric, no Rs
        tx.notes || '',
        tx.paymentMethod || 'Cash',
        bal, // clean numeric, no Rs (Col H)
        '', // Col I: thin spacer gap (25px)
        oow > 0 ? oow : '', // Col J: Out of Wallet
        '', // Col K: thin spacer gap (25px)
        isCard ? tx.amount : '', // Col L: Card Payment
        '', // Col M: spacer before Lend (30px)
        ...nextLendCols,
      ]);
    });
  });

  // If there are still lend items after placing all transactions:
  while (lendIdx < safeLends.length) {
    const remainingLend = safeLends[lendIdx++];
    rows.push([
      '', '', '', '', '', '', '', '', '', '', '', '', '',
      formatLendDateTime(remainingLend),
      remainingLend.amount, // clean numeric, no Rs
      `${remainingLend.personName}${remainingLend.thingsOrReason ? ` - ${remainingLend.thingsOrReason}` : ''}`,
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
