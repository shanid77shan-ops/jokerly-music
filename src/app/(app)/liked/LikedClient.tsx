"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, Music, Mic2, Play, Trash2, Loader2, ArrowLeft, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useLikesStore, LikedSong, LikedArtist } from "@/store/likes";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import ArtistSheet from "@/components/music/ArtistSheet";
import { SpotifyArtist } from "@/types/spotify";
import TransferResultDialog, { TransferResult } from "@/components/spotify/TransferResultDialog";
import { SPOTIFY_SCOPES } from "@/lib/spotify-scopes";

export default function LikedClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const { songs, artists, loaded, load, toggleSong, toggleArtist } = useLikesStore();
  const { setQueueAndPlay } = usePlayerStore();
  const [tab, setTab] = useState<"songs" | "artists">("songs");
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState<TransferResult | null>(null);

  useEffect(() => { load(); }, [load]);

  const continueWithSpotify = useCallback(() => {
    void signIn(
      "spotify",
      { callbackUrl: window.location.href },
      { scope: SPOTIFY_SCOPES, show_dialog: "true" }
    );
  }, []);

  const playSong = (song: LikedSong, index: number) => {
    const queue: PlayableTrack[] = songs.map((s) => ({
      name: s.track_name,
      artist: s.track_artist ?? "",
      image: s.track_image ?? undefined,
      uri: s.track_uri,
    }));
    setQueueAndPlay(queue, index);
  };

  const playAll = () => {
    if (songs.length === 0) return;
    playSong(songs[0], 0);
  };

  const openArtist = (a: LikedArtist) => {
    setSelectedArtist({
      id: a.artist_id,
      name: a.artist_name,
      images: a.artist_image ? [{ url: a.artist_image }] : [],
      followers: { total: 0 },
      genres: [],
      external_urls: { spotify: "" },
      popularity: 0,
      type: "artist",
      uri: "",
    } as SpotifyArtist);
  };

  const transferLikedToSpotify = useCallback(async () => {
    if (songs.length === 0 && artists.length === 0) {
      setTransferResult({
        type: "error",
        title: "Nothing To Transfer",
        message: "Like some songs or artists first, then try again.",
      });
      return;
    }

    setTransferring(true);
    try {
      const accessToken = (session as { accessToken?: string } | null)?.accessToken;
      const res = await fetch("/api/spotify/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ action: "liked" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setTransferResult({
          type: "error",
          title: "Spotify Permission Needed",
          message: data.error || "Connect Spotify once to allow playlist, liked song, and artist transfer.",
          details: data.error || "Spotify needs a one-time permission upgrade before transfer can continue.",
          needsReauth: true,
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not transfer liked items");

      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      setTransferResult({
        type: warnings.length > 0 ? "error" : "success",
        title: warnings.length > 0 ? "Transfer Partially Completed" : "Transfer Successful",
        message: `Transferred ${data.savedSongCount ?? 0} songs and ${data.followedArtistCount ?? 0} artists to Spotify.`,
        ...(warnings.length > 0 ? { details: warnings.join("\n") } : {}),
      });
    } catch (e) {
      const message = (e as Error).message || "Could not transfer liked items";
      const needsReauth =
        message.toLowerCase().includes("spotify") &&
        (message.toLowerCase().includes("permission") || message.toLowerCase().includes("token"));
      setTransferResult({
        type: "error",
        title: "Transfer Failed",
        message,
        details: message,
        needsReauth,
      });
    } finally {
      setTransferring(false);
    }
  }, [artists.length, session, songs.length]);

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl transition-colors"
          style={{ color: "rgba(255,255,255,0.45)" }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#E8282B]/15 flex items-center justify-center">
            <Heart size={16} className="text-[#E8282B]" fill="currentColor" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Liked</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {songs.length} song{songs.length !== 1 ? "s" : ""} · {artists.length} artist{artists.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => void transferLikedToSpotify()}
          disabled={transferring || !loaded || (songs.length === 0 && artists.length === 0)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#E8282B]/15 text-[#E8282B] font-semibold text-xs transition-all active:scale-95 disabled:opacity-40 hover:bg-[#E8282B]/25"
        >
          {transferring ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Transfer
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["songs", "artists"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
              tab === t ? "bg-[#E8282B] text-white" : "text-white/50 hover:text-white hover:bg-white/[0.07]"
            }`}
            style={tab !== t ? { background: "var(--card)" } : {}}>
            {t}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[#E8282B]/60" />
        </div>
      ) : tab === "songs" ? (
        <SongsTab songs={songs} onPlay={playSong} onPlayAll={playAll} onUnlike={(s) => toggleSong({ uri: s.track_uri, name: s.track_name })} />
      ) : (
        <ArtistsTab artists={artists} onOpen={openArtist} onUnlike={(a) => toggleArtist({ id: a.artist_id, name: a.artist_name })} />
      )}

      {selectedArtist && <ArtistSheet artist={selectedArtist} onClose={() => setSelectedArtist(null)} />}
      {transferResult && (
        <TransferResultDialog
          result={transferResult}
          onClose={() => setTransferResult(null)}
          onReauthorize={continueWithSpotify}
        />
      )}
    </div>
  );
}

function SongsTab({ songs, onPlay, onPlayAll, onUnlike }: {
  songs: LikedSong[];
  onPlay: (s: LikedSong, i: number) => void;
  onPlayAll: () => void;
  onUnlike: (s: LikedSong) => void;
}) {
  const { currentTrack, isPlaying } = usePlayerStore();

  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "var(--card)" }}>
          <Heart size={28} className="text-white/15" />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No liked songs yet</p>
        <p className="text-xs opacity-60" style={{ color: "var(--text-muted)" }}>Hit the heart on any track to save it here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button onClick={onPlayAll}
        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95 shadow-lg"
        style={{ background: "#E8282B", boxShadow: "0 4px 16px rgba(232,40,43,0.35)" }}>
        <Play size={15} fill="white" /> Play all
      </button>
      <div className="rounded-2xl overflow-hidden border" style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.06)" }}>
        {songs.map((s, i) => {
          const active = isPlaying && currentTrack?.uri === s.track_uri;
          return (
            <div key={s.id}
              onClick={() => onPlay(s, i)}
              className={`flex items-center gap-3 px-3 py-2.5 group cursor-pointer transition-colors hover:bg-white/[0.04] ${
                i < songs.length - 1 ? "border-b" : ""
              }`}
              style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <div className="relative w-10 h-10 shrink-0 rounded-xl overflow-hidden" style={{ background: "var(--surface)" }}>
                {s.track_image
                  ? <Image src={s.track_image} alt={s.track_name} fill unoptimized sizes="40px" className="object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Music size={14} className="text-white/20" /></div>}
                <div className={`absolute inset-0 rounded-xl flex items-center justify-center transition-opacity bg-black/50 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                  <Play size={13} fill="white" className="text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate leading-tight ${active ? "text-[#E8282B]" : "text-white"}`}>{s.track_name}</p>
                {s.track_artist && <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{s.track_artist}</p>}
              </div>
              <button onClick={(e) => { e.stopPropagation(); onUnlike(s); }}
                className="shrink-0 p-1.5 rounded-lg text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100 opacity-100">
                <Heart size={14} fill="currentColor" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onUnlike(s); }}
                title="Remove"
                className="shrink-0 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100">
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArtistsTab({ artists, onOpen, onUnlike }: {
  artists: LikedArtist[];
  onOpen: (a: LikedArtist) => void;
  onUnlike: (a: LikedArtist) => void;
}) {
  if (artists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "var(--card)" }}>
          <Mic2 size={28} className="text-white/15" />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No liked artists yet</p>
        <p className="text-xs opacity-60" style={{ color: "var(--text-muted)" }}>Open any artist and tap the heart to save them</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {artists.map((a) => (
        <div key={a.id} className="relative group">
          <button onClick={() => onOpen(a)}
            className="w-full flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08]">
            <div className="relative w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/[0.06] group-hover:ring-[#E8282B]/40 transition-all">
              {a.artist_image
                ? <Image src={a.artist_image} alt={a.artist_name} fill unoptimized sizes="64px" className="object-cover" />
                : <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--card)" }}><Mic2 size={20} className="text-white/20" /></div>}
            </div>
            <p className="text-xs font-semibold text-white text-center truncate w-full leading-tight">{a.artist_name}</p>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnlike(a);
            }}
            title="Remove artist"
            className="absolute top-1 right-1 p-1.5 rounded-full bg-black/70 border border-white/10 text-white/80 hover:text-red-400 hover:bg-red-500/20 transition-colors shadow-md"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
