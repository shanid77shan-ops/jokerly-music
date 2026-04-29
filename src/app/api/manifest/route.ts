export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: "Jokerly",
    short_name: "Jokerly",
    description: "Discover, search, and play your music",
    start_url: "/",
    display: "standalone",
    background_color: "#07051a",
    theme_color: "#07051a",
    orientation: "portrait",
    icons: [
      { src: "/icon-72.png",  sizes: "72x72",   type: "image/png", purpose: "any" },
      { src: "/icon-96.png",  sizes: "96x96",   type: "image/png", purpose: "any" },
      { src: "/icon-128.png", sizes: "128x128", type: "image/png", purpose: "any" },
      { src: "/icon-144.png", sizes: "144x144", type: "image/png", purpose: "any" },
      { src: "/icon-152.png", sizes: "152x152", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
