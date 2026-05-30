import { NextRequest, NextResponse } from "next/server";

// Redirect to the static manifest so CDN cache of this route
// always resolves to the up-to-date public/manifest.json
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/manifest.json", request.url), {
    status: 301,
    headers: { "Cache-Control": "no-store" },
  });
}
