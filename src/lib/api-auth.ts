import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function getApiSession() {
  try {
    const session = await auth();
    if (!session?.spotifyId) return null;
    return session;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
