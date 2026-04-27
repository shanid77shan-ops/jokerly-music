const BASE = "https://ws.audioscrobbler.com/2.0/";
const API_KEY = process.env.LASTFM_API_KEY!;

async function lfm<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(BASE);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Last.fm error: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm: ${data.message}`);
  return data as T;
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchTracks(query: string, limit = 20, page = 1) {
  const d = await lfm<any>({ method: "track.search", track: query, limit: String(limit), page: String(page) });
  return (d.results?.trackmatches?.track ?? []) as LfmTrack[];
}

export async function searchArtists(query: string, limit = 20, page = 1) {
  const d = await lfm<any>({ method: "artist.search", artist: query, limit: String(limit), page: String(page) });
  return (d.results?.artistmatches?.artist ?? []) as LfmArtist[];
}

export async function searchAlbums(query: string, limit = 20, page = 1) {
  const d = await lfm<any>({ method: "album.search", album: query, limit: String(limit), page: String(page) });
  return (d.results?.albummatches?.album ?? []) as LfmAlbum[];
}

// ── Artist ────────────────────────────────────────────────────────────────────

export async function getArtistInfo(artist: string) {
  const d = await lfm<any>({ method: "artist.getInfo", artist, autocorrect: "1" });
  return d.artist as LfmArtistInfo;
}

export async function getSimilarArtists(artist: string, limit = 12) {
  const d = await lfm<any>({ method: "artist.getSimilar", artist, limit: String(limit), autocorrect: "1" });
  return (d.similarartists?.artist ?? []) as LfmArtist[];
}

export async function getArtistTopTracks(artist: string, limit = 10) {
  const d = await lfm<any>({ method: "artist.getTopTracks", artist, limit: String(limit), autocorrect: "1" });
  return (d.toptracks?.track ?? []) as LfmTrack[];
}

// ── Track ─────────────────────────────────────────────────────────────────────

export async function getTrackInfo(track: string, artist: string) {
  const d = await lfm<any>({ method: "track.getInfo", track, artist, autocorrect: "1" });
  return d.track as LfmTrackInfo;
}

export async function getSimilarTracks(track: string, artist: string, limit = 20) {
  const d = await lfm<any>({ method: "track.getSimilar", track, artist, limit: String(limit), autocorrect: "1" });
  return (d.similartracks?.track ?? []) as LfmTrack[];
}

// ── Charts ────────────────────────────────────────────────────────────────────

export async function getTopTracks(limit = 20) {
  const d = await lfm<any>({ method: "chart.getTopTracks", limit: String(limit) });
  return (d.tracks?.track ?? []) as LfmTrack[];
}

export async function getTopArtists(limit = 12) {
  const d = await lfm<any>({ method: "chart.getTopArtists", limit: String(limit) });
  return (d.artists?.artist ?? []) as LfmArtist[];
}

export async function getTagTopTracks(tag: string, limit = 20) {
  const d = await lfm<any>({ method: "tag.getTopTracks", tag, limit: String(limit) });
  return (d.tracks?.track ?? []) as LfmTrack[];
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LfmImage {
  "#text": string;
  size: "small" | "medium" | "large" | "extralarge" | "mega" | "";
}

export interface LfmTrack {
  name: string;
  artist: string | { name: string; mbid?: string; url?: string };
  url: string;
  mbid?: string;
  image?: LfmImage[];
  duration?: string;
  listeners?: string;
  playcount?: string;
}

export interface LfmTrackInfo extends LfmTrack {
  album?: { title: string; image?: LfmImage[] };
  wiki?: { summary: string };
  toptags?: { tag: { name: string; url: string }[] };
}

export interface LfmArtist {
  name: string;
  url: string;
  mbid?: string;
  image?: LfmImage[];
  listeners?: string;
  match?: string;
}

export interface LfmArtistInfo extends LfmArtist {
  bio?: { summary: string; content: string };
  stats?: { listeners: string; playcount: string };
  tags?: { tag: { name: string; url: string }[] };
  similar?: { artist: LfmArtist[] };
}

export interface LfmAlbum {
  name: string;
  artist: string;
  url: string;
  mbid?: string;
  image?: LfmImage[];
}

export function lfmImage(images?: LfmImage[], size: LfmImage["size"] = "extralarge"): string {
  if (!images) return "";
  const img = images.find((i) => i.size === size) ?? images[images.length - 1];
  return img?.["#text"] ?? "";
}

export function lfmArtistName(artist: LfmTrack["artist"]): string {
  return typeof artist === "string" ? artist : artist.name;
}
