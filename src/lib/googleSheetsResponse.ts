/**
 * Recreate a Google API response returned by the authenticated Edge proxy.
 * Fetch forbids bodies on 204, 205 and 304 responses, even an empty string.
 */
export const googleProxyResponse = (body: string, status: number, contentType?: string): Response => {
  const bodyless = status === 204 || status === 205 || status === 304;
  return new Response(bodyless ? null : body, {
    status,
    headers: { 'Content-Type': contentType || 'application/json' },
  });
};
