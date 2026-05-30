/** Spotify Web Playback SDK uses EME; only map known DRM failures to a friendly message. */

export function formatPlaybackEnvironmentError(raw?: string): string {
  const text = (raw ?? "").toLowerCase();
  if (
    text.includes("setservercertificate") ||
    text.includes("generaterequest") ||
    text.includes("no supported keysystem") ||
    text.includes("requestmediakeysystemaccess") ||
    text.includes("platform does not support")
  ) {
    return "Protected audio (DRM) is blocked in this browser. Use HTTPS, allow protected content in site settings, and try Chrome, Edge, or Safari. Privacy extensions can also block playback.";
  }
  if (text.includes("secure context") || text.includes("only secure origins")) {
    return "Playback requires HTTPS. Open https://music.devshanidp.xyz (not http://).";
  }
  return raw?.trim() || "Playback is not supported in this browser.";
}

export function getInsecurePlaybackMessage(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) {
    return "Playback requires HTTPS. Open https://music.devshanidp.xyz (not http://).";
  }
  return null;
}
