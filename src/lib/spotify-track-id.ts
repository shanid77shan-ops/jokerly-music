export function spotifyTrackIdFromUri(uri?: string | null): string | null {
  if (!uri) return null;
  const match = uri.match(/spotify:track:([A-Za-z0-9]+)/);
  return match?.[1] ?? null;
}
