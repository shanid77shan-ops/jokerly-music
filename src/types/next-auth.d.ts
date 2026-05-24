import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    spotifyId: string;
    error?: string;
    user: DefaultSession["user"];
  }
}
