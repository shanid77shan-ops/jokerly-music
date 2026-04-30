export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: "Jokerly",
    short_name: "Jokerly",
    description: "Discover, search, and play your music",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    orientation: "portrait",
    categories: ["music", "entertainment"],
    lang: "en",
    icons: [
      { src: "/api/icon?size=72",  sizes: "72x72",   type: "image/png", purpose: "any" },
      { src: "/api/icon?size=96",  sizes: "96x96",   type: "image/png", purpose: "any" },
      { src: "/api/icon?size=128", sizes: "128x128", type: "image/png", purpose: "any" },
      { src: "/api/icon?size=144", sizes: "144x144", type: "image/png", purpose: "any" },
      { src: "/api/icon?size=152", sizes: "152x152", type: "image/png", purpose: "any" },
      { src: "/api/icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/icon?size=192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/api/icon?size=384", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/api/icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/icon?size=512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
