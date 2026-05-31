/** Required for NextAuth / Spotify login (see Vercel → Settings → Environment Variables). */
export function getMissingAuthEnv(): string[] {
  const missing: string[] = [];
  if (!(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)?.trim()) {
    missing.push("AUTH_SECRET (or NEXTAUTH_SECRET)");
  }
  if (!process.env.SPOTIFY_CLIENT_ID?.trim()) missing.push("SPOTIFY_CLIENT_ID");
  if (!process.env.SPOTIFY_CLIENT_SECRET?.trim()) missing.push("SPOTIFY_CLIENT_SECRET");
  return missing;
}

export function isAuthConfigured(): boolean {
  return getMissingAuthEnv().length === 0;
}
