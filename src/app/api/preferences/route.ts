import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  let session;
  try { session = await auth(); } catch { return NextResponse.json({ error: "Auth error" }, { status: 401 }); }
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_language_prefs")
    .select("languages")
    .eq("user_id", session.spotifyId)
    .single();

  return NextResponse.json({ languages: data?.languages ?? null });
}

export async function POST(req: NextRequest) {
  let session;
  try { session = await auth(); } catch { return NextResponse.json({ error: "Auth error" }, { status: 401 }); }
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { languages } = await req.json();
  if (!Array.isArray(languages)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_language_prefs")
    .upsert({ user_id: session.spotifyId, languages, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
