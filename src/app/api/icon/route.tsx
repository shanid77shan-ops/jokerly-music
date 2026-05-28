import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const VALID_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

export async function GET(req: NextRequest) {
  const raw = parseInt(new URL(req.url).searchParams.get("size") ?? "192", 10);
  const size = VALID_SIZES.includes(raw) ? raw : 192;

  // Build absolute URL for the logo so it works in both dev and production
  const logoUrl = new URL("/logo.png", req.url).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          overflow: "hidden",
          borderRadius: size * 0.18,
          background: "#000000",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt="JKMuusic"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center center",
          }}
        />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=604800, immutable",
      },
    }
  );
}
