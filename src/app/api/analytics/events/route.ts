import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 200 });
    if (!session.spotifyId) return NextResponse.json({ ok: false, reason: "no_user" }, { status: 200 });

    const body = await req.json().catch(() => null);
    if (!body?.event_type) {
      return NextResponse.json({ ok: false, reason: "missing_event_type" }, { status: 200 });
    }

    const supabase = await createClient();
    const { error } = await supabase.from("listening_analytics").insert({
      user_id: session.spotifyId,
      event_type: body.event_type,
      track_uri: body.track_uri ?? null,
      track_name: body.track_name ?? null,
      track_artist: body.track_artist ?? null,
      meta: body.meta ?? null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[analytics/events] insert error:", error.message);
      return NextResponse.json({ ok: false, reason: "db_error" }, { status: 200 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[analytics/events] unhandled:", e);
    return NextResponse.json({ ok: false, reason: "exception" }, { status: 200 });
  }
}
