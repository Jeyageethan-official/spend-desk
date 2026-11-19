export interface GoogleSpreadsheetListItem {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
}

/** Google Drive can return duplicates across pages; titles are never identity. */
export const dedupeGoogleSpreadsheets = <T extends GoogleSpreadsheetListItem>(items: T[]): T[] => {
  const byId = new Map<string, T>();
  for (const item of items) {
    const id = item?.id?.trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, { ...item, id });
  }
  return Array.from(byId.values());
};
