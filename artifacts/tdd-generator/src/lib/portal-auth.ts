/**
 * Stub module — authentication is disabled.
 * These exports are kept so that existing imports in Preview.tsx continue to
 * compile without changes.
 */

export async function getAccessTokenForApi(): Promise<string | null> {
  return null;
}
