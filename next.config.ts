import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Permissions-Policy", value: "encrypted-media=(self)" },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/spotify/identify": ["./bin/**"],
  },
  images: {
    remotePatterns: [
      // Last.fm CDN
      { protocol: "https", hostname: "lastfm.freetls.fastly.net" },
      { protocol: "https", hostname: "*.lastfm.freetls.fastly.net" },
      // Spotify CDNs (multiple subdomains used in practice)
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "mosaic.scdn.co" },
      { protocol: "https", hostname: "*.scdn.co" },
      { protocol: "https", hostname: "image-cdn-ak.spotifycdn.com" },
      { protocol: "https", hostname: "image-cdn-fa.spotifycdn.com" },
      { protocol: "https", hostname: "*.spotifycdn.com" },
      // iTunes / Apple Music artwork
      { protocol: "https", hostname: "*.mzstatic.com" },
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is2-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is3-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is4-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is5-ssl.mzstatic.com" },
      // Google avatars
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
