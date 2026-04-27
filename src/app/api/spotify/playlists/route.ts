import { auth } from "@/lib/auth";
import { getUserPlaylists, createPlaylist } from "@/lib/spotify";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getUserPlaylists(session.accessToken);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken || !session.spotifyId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description } = await req.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const playlist = await createPlaylist(
    session.spotifyId,
    name,
    description ?? "",
    session.accessToken
  );
  return NextResponse.json(playlist);
}
