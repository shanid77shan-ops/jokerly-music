import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Spotify from "next-auth/providers/spotify";
import { authConfig } from "./auth.config";
import { getMissingAuthEnv } from "./auth-env";
import { SPOTIFY_SCOPES } from "./spotify-scopes";

const missingAuthEnv = getMissingAuthEnv();
if (missingAuthEnv.length > 0) {
  console.error(
    `[auth] Missing environment variables: ${missingAuthEnv.join(", ")}. Login will fail with Configuration error.`
  );
}

type SpotifyToken = JWT & {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  spotifyId?: string;
  spotifyScope?: string;
  error?: string;
};

export async function refreshAccessToken(token: SpotifyToken): Promise<SpotifyToken> {
  if (!token.refreshToken) return { ...token, error: "RefreshAccessTokenError" };

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refreshToken }),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
      refreshToken: data.refresh_token ?? token.refreshToken,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      checks: ["state"],
      authorization: {
        url: "https://accounts.spotify.com/authorize",
        params: { scope: SPOTIFY_SCOPES, show_dialog: "true" },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token ?? (token as SpotifyToken).refreshToken,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000,
          spotifyId: account.providerAccountId,
          spotifyScope: account.scope,
        };
      }
      const spotifyToken = token as SpotifyToken;
      const expiresAt = spotifyToken.accessTokenExpires ?? 0;
      // Refresh slightly before expiry so client/SDK calls don't hit 401.
      if (Date.now() < expiresAt - 60_000) return token;
      return refreshAccessToken(spotifyToken);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.spotifyId = token.spotifyId as string;
      session.spotifyScope = token.spotifyScope as string | undefined;
      session.error = token.error as string | undefined;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
