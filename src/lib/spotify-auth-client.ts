import { SPOTIFY_SCOPES } from "@/lib/spotify-scopes";

/** Forces Spotify account picker (any user can pick their own account). */
export const SPOTIFY_SIGN_IN_OPTIONS = {
  scope: SPOTIFY_SCOPES,
  show_dialog: "true",
} as const;
