import { auth } from "@/lib/auth";
import { updatePlaylist, addTracksToPlaylist, getPlaylistTracks } from "@/lib/spotify";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await getPlaylistTracks(id, session.accessToken);
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { name, description } = await req.json();
  await updatePlaylist(id, name, description ?? "", session.accessToken);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { uris } = await req.json();
  const data = await addTracksToPlaylist(id, uris, session.accessToken);
  return NextResponse.json(data);
}
