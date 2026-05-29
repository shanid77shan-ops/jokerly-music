/** Spotify Web Playback SDK needs Encrypted Media Extensions (Widevine/FairPlay). */

export function formatPlaybackEnvironmentError(raw?: string): string {
  const text = (raw ?? "").toLowerCase();
  if (
    text.includes("setservercertificate") ||
    text.includes("generateRequest") ||
    text.includes("generate request") ||
    text.includes("mediakeys") ||
    text.includes("eme") ||
    text.includes("drm") ||
    text.includes("protected content") ||
    text.includes("keysystem") ||
    text.includes("widevine")
  ) {
    return "Protected audio (DRM) is blocked in this browser. Use HTTPS, allow protected content in site settings, and try Chrome, Edge, or Safari. Privacy extensions can also block playback.";
  }
  if (text.includes("secure context") || text.includes("https")) {
    return "Playback requires a secure connection. Open the site with https:// (not http://).";
  }
  return raw?.trim() || "Playback is not supported in this browser.";
}

export async function checkPlaybackEnvironment(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (typeof window === "undefined") {
    return { ok: false, message: "Playback is only available in the browser." };
  }

  if (!window.isSecureContext) {
    return {
      ok: false,
      message: formatPlaybackEnvironmentError("secure context required — use HTTPS"),
    };
  }

  const requestKeySystem = navigator.requestMediaKeySystemAccess;
  if (!requestKeySystem) {
    return {
      ok: false,
      message: formatPlaybackEnvironmentError("navigator.requestMediaKeySystemAccess missing"),
    };
  }

  try {
    await requestKeySystem("com.widevine.alpha", [
      {
        initDataTypes: ["cenc"],
        audioCapabilities: [
          { contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: "SW_SECURE_CRYPTO" },
        ],
      },
    ]);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: formatPlaybackEnvironmentError((e as Error).message),
    };
  }
}
